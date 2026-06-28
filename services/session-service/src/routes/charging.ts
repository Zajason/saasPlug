import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { SessionStatus } from "@prisma/client";
import { setChargerStatusRedis, cancelReservationRedis } from "../services/availabilityRedis.ts";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";

const router = express.Router();
router.use(verifyToken);

// Assuming your Charger Service runs on a specific port. Put this in your .env!
const CHARGER_SERVICE_URL = process.env.CHARGER_SERVICE_URL || "http://localhost:8084";
const RESERVATION_SERVICE_URL = process.env.RESERVATION_SERVICE_URL || "http://localhost:8085";

type ChargerDetails = {
  providerId?: number | null;
  kwhprice?: number;
  maxKW?: number;
};

type ReservationDetails = {
  id: number;
  userId: number;
  chargerId: number;
  startsAt: string;
  expiresAt: string;
  status: string;
};

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── POST /charging/start ── */
router.post("/start", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { reservationId, batteryCapacityKWh, currentBatteryLevel } = req.body;

    if (!reservationId || typeof reservationId !== "number") {
      return res.status(400).json({ error: "reservationId (number) is required" });
    }

    const reservationRes = await fetch(`${RESERVATION_SERVICE_URL}/api/v1/internal/reservations/${reservationId}`);
    if (reservationRes.status === 404) return res.status(404).json({ error: "Reservation not found" });
    if (!reservationRes.ok) return res.status(502).json({ error: "Reservation service could not load the reservation" });
    const reservationPayload = (await reservationRes.json()) as { reservation: ReservationDetails };
    const reservation = reservationPayload.reservation;

    if (reservation.userId !== userId) return res.status(403).json({ error: "Reservation does not belong to you" });
    if (reservation.status !== "ACTIVE") return res.status(409).json({ error: "Reservation is no longer active" });
    if (new Date(reservation.expiresAt) < new Date()) return res.status(410).json({ error: "Reservation has expired" });

    // API CALL TO CHARGER SERVICE (Replacing `include: { charger: true }`)
    const chargerRes = await fetch(`${CHARGER_SERVICE_URL}/api/v1/chargers/${reservation.chargerId}`);
    if (!chargerRes.ok) return res.status(404).json({ error: "Charger details could not be found" });
    const chargerData = (await chargerRes.json()) as ChargerDetails;

    let maxKWh: number | null = null;
    if (typeof batteryCapacityKWh === "number" && typeof currentBatteryLevel === "number") {
      maxKWh = parseFloat(((batteryCapacityKWh * (100 - currentBatteryLevel)) / 100).toFixed(3));
    }

    const session = await prisma.$transaction(async (tx) => {
      const s = await tx.session.create({
        data: {
          userId,
          chargerId: reservation.chargerId,
          reservationId: reservation.id,
          startedAt: new Date(),
          kWh: 0,
          maxKWh,
          pricePerKWh: chargerData.kwhprice,
          status: SessionStatus.RUNNING,
        },
      });

      return s;
    });

    await fetch(`${RESERVATION_SERVICE_URL}/api/v1/internal/reservations/${reservation.id}/expire`, {
      method: "POST",
    });

    await cancelReservationRedis({ userId, chargerId: reservation.chargerId });
    await setChargerStatusRedis(reservation.chargerId, "in_use");

    await publishDomainEvent("session.started", {
      sessionId: session.id,
      reservationId: reservation.id,
      userId,
      chargerId: reservation.chargerId,
      providerId: chargerData.providerId ?? null,
      startedAt: session.startedAt.toISOString(),
    });

    return res.status(201).json({
      sessionId: session.id,
      chargerId: reservation.chargerId,
      startedAt: formatDate(session.startedAt),
      pricePerKWh: chargerData.kwhprice,
      maxKW: chargerData.maxKW,
    });
  } catch (err: any) {
    console.error("[charging/start] error:", err);
    return res.status(500).json({ error: "Failed to start charging", details: err.message });
  }
});

/* ── POST /charging/stop ── */
router.post("/stop", async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { sessionId } = req.body;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.userId !== userId) return res.status(403).json({ error: "Session does not belong to you" });
    if (session.status !== SessionStatus.RUNNING) return res.status(409).json({ error: "Session is not running" });

    // Look up charger details via API to calculate time elapsed properly
    const chargerRes = await fetch(`${CHARGER_SERVICE_URL}/api/v1/chargers/${session.chargerId}`);
    const chargerData = (chargerRes.ok ? await chargerRes.json() : { maxKW: 50 }) as ChargerDetails; // Fallback

    const now = new Date();
    const elapsedHours = (now.getTime() - session.startedAt.getTime()) / 3_600_000;
    
    const maxKW = chargerData.maxKW ?? 50;
    let finalKWh = parseFloat((elapsedHours * maxKW).toFixed(3));
    if (session.maxKWh !== null && finalKWh > session.maxKWh) finalKWh = session.maxKWh;

    const pricePerKWh = Number(session.pricePerKWh ?? 0.25);
    const costEur = parseFloat((finalKWh * pricePerKWh).toFixed(2));

    await prisma.session.update({
      where: { id: sessionId },
      data: { endedAt: now, kWh: finalKWh, costEur, status: SessionStatus.USER_STOPPED },
    });

    await setChargerStatusRedis(session.chargerId, "available");

    // 🚀 THE MICROSERVICE MAGIC: We don't charge the card here! We just broadcast that it stopped.
    // The Billing Service will hear this, create the invoice, and capture the Stripe payment.
    await publishDomainEvent("session.stopped", {
      sessionId,
      userId,
      chargerId: session.chargerId,
      providerId: chargerData.providerId ?? null,
      endedAt: now.toISOString(),
      kWh: finalKWh,
      costEur,
      status: SessionStatus.USER_STOPPED,
    });

    return res.json({ 
      sessionId, 
      kWh: finalKWh, 
      costEur, 
      message: "Session stopped. Payment processing in background." 
    });
  } catch (err: any) {
    console.error("[charging/stop] error:", err);
    return res.status(500).json({ error: "Failed to stop charging" });
  }
});

// ... you will do the same exact fetch & RabbitMQ logic for GET /status/:sessionId
export default router;
