import express, { Request, Response } from "express";
import prisma from "../prisma/client.js"; 
import { makeErrorLog } from "../middleware/errorHandler.js"; 
import { verifyToken } from "../middleware/verifyToken.js"; 
import { ReservationStatus } from "@prisma/client";
import { preAuthorize, cancelPreAuth } from "../controllers/paymentController.js"; 
import { cancelReservationRedis, reserveAtomic } from "../services/availabilityRedis.js"; 
import { publishDomainEvent } from "../messaging/rabbitmq.ts";
const router = express.Router();

const reservationSupportedProviders = new Set(["redPlug", "greenPlug", "bluePlug"]);
const CHARGER_SERVICE_URL = process.env.CHARGER_SERVICE_URL || "http://localhost:8084";
const INTEGRATION_SERVICE_URL = process.env.INTEGRATION_SERVICE_URL || "http://localhost:8090";

type ChargerDetails = {
  id: number;
  providerName?: string | null;
  providerId?: number | null;
  status?: string;
};

function getExternalProvider(charger: ChargerDetails) {
  return charger.providerName ?? null;
}

async function getChargerDetails(id: number): Promise<ChargerDetails | null> {
  const response = await fetch(`${CHARGER_SERVICE_URL}/api/v1/chargers/${id}`);
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Charger service returned ${response.status}`);
  return (await response.json()) as ChargerDetails;
}

const handleReserve = async (req: Request, res: Response) => {
  try {
    console.log("[reserve] incoming request", { path: req.path, params: req.params });

    const id = Number(req.params.id);
    if (isNaN(id)) {
      const err = makeErrorLog(req, 400, `Invalid charger id '${req.params.id}'`);
      return res.status(400).json(err);
    }

    const minutesRaw = Number(req.params.minutes);
    const minutes = !minutesRaw || isNaN(minutesRaw) ? 30 : Math.min(minutesRaw, 60);

    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const charger = await getChargerDetails(id);
    if (!charger) {
      const err = makeErrorLog(req, 404, `Charger ${id} not found`);
      return res.status(404).json(err);
    }

    const externalProvider = getExternalProvider(charger);
    if (!externalProvider || !reservationSupportedProviders.has(externalProvider)) {
      return res.status(409).json({
        error: "This provider does not support charger reservations through its API.",
        externalProvider: externalProvider ?? charger.providerName ?? "unknown",
      });
    }

    // Block reserving if charger is OUTAGE
    if (charger.status === "outage" || charger.status === "OUTAGE") {
      const err = makeErrorLog(req, 409, `Charger ${id} is out of service`);
      return res.status(409).json(err);
    }

    // ---------------------------------------------------------
    // FIXED LOGIC: Handle Active Reservations & Ghost Redis Keys
    // ---------------------------------------------------------
    const now = new Date();
    const existingReservation = await prisma.reservation.findFirst({
      where: {
        userId,
        status: ReservationStatus.ACTIVE,
        expiresAt: { gt: now },
      },
    });

    if (existingReservation) {
      // SCENARIO 1: User reserved THIS charger. Treat as stale/retry.
      if (existingReservation.chargerId === id) {
        console.log(`[reserve] Found stale reservation ${existingReservation.id} for same charger. Auto-canceling.`);
        
        await prisma.reservation.update({
          where: { id: existingReservation.id },
          data: { status: ReservationStatus.CANCELLED } 
        });

        // Clear Redis lock
        await cancelReservationRedis({ userId, chargerId: id });
        
        if (existingReservation.paymentIntentId) {
            try { await cancelPreAuth(existingReservation.paymentIntentId); } catch {}
        }
      } 
      // SCENARIO 2: User has reservation on DIFFERENT charger.
      else {
        const err = makeErrorLog(
          req,
          400,
          "User already has an active reservation on another charger."
        );
        return res.status(400).json(err);
      }
    } 
    else {
      // SCENARIO 3: DB says "No Reservation".
      // CRITICAL FIX: Force clear Redis lock for this user.
      // This handles cases where 'resetpoints' cleared DB but left keys in Redis,
      // or 'updpoint' cleared the charger status but left the Redis lock.
      try {
          await cancelReservationRedis({ userId, chargerId: id });
          console.log(`[reserve] Cleared potential ghost Redis locks for user ${userId}`);
      } catch (e) {
          // Ignore error if key didn't exist
      }
    }
    // ---------------------------------------------------------

    const skipPaymentCheck = process.env.CI === "true" || process.env.NODE_ENV === "test";

    // Payment pre-auth
    let intent: any = null;
    if (!skipPaymentCheck) {
      const paymentMethod = await prisma.paymentMethod.findFirst({
        where: {
          userId,
          provider: { in: ["stripe", "mock"] },
          status: "valid",
          stripePaymentMethodId: { not: null },
        },
      });

      if (!paymentMethod) {
        return res
          .status(400)
          .json({ error: "You must add a payment method before reserving. Go to Billing to add a card." });
      }

      // Block reservation if user has outstanding balance
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { outstandingBalanceEur: true } });
      if (user && Number(user.outstandingBalanceEur) > 0) {
        return res.status(402).json({
          error: `You have an outstanding balance of ${Number(user.outstandingBalanceEur).toFixed(2)} EUR. Please pay it before reserving.`,
          outstandingBalanceEur: Number(user.outstandingBalanceEur),
        });
      }

      try {
        intent = await preAuthorize(userId, 3);
      } catch (preAuthErr: any) {
        console.error("[reserve] pre-auth failed:", preAuthErr.message);
        return res.status(402).json({
          error: "Payment pre-authorization failed. Please check your card.",
          details: preAuthErr.message,
        });
      }
    }

    // Redis atomic lock
    const ttlMs = minutes * 60_000;
    const locked = await reserveAtomic({ userId, chargerId: id, ttlMs });

    if (!locked.ok) {
      if (intent?.id) {
        try { await cancelPreAuth(intent.id); } catch {}
      }

      if (locked.reason === "USER_ALREADY_HAS_RESERVATION") {
        // This should rarely happen now because we cleared ghost keys above
        return res.status(400).json(makeErrorLog(req, 400, "User already has an active reservation."));
      }
      if (locked.reason === "CHARGER_ALREADY_RESERVED") {
        return res.status(409).json(makeErrorLog(req, 409, "Charger is already reserved."));
      }
      return res.status(500).json(makeErrorLog(req, 500, "Redis reservation failed"));
    }

    // --- EXTERNAL PROVIDER API CALL ---
    if (externalProvider && reservationSupportedProviders.has(externalProvider)) {
      try {
        const response = await fetch(`${INTEGRATION_SERVICE_URL}/api/v1/internal/provider-chargers/${id}/reserve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minutes }),
        });
        if (!response.ok) {
          const details = await response.text();
          throw new Error(details || `Integration service returned ${response.status}`);
        }
        console.log(`[reserve] Successfully reserved externally on ${externalProvider} for charger ${id}`);
      } catch (extErr: any) {
        console.error("[reserve] External API reservation failed:", extErr.message);
        
        // Rollback local locks since the real provider rejected us!
        if (intent?.id) try { await cancelPreAuth(intent.id); } catch {}
        await cancelReservationRedis({ userId, chargerId: id });
        
        return res.status(502).json(makeErrorLog(req, 502, `Failed to reserve on external provider API: ${externalProvider}`, extErr.message));
      }
    }

    const startsAt = new Date();
    const expiresAt = new Date(locked.expiresAtMs);

    // Create DB reservation. Charger.status is updated by charger-service
    // via the reservation.created event (event-driven, no direct cross-service DB writes).
    const reservation = await prisma.reservation.create({
      data: {
        userId,
        chargerId: id,
        startsAt,
        expiresAt,
        status: ReservationStatus.ACTIVE,
        paymentIntentId: intent?.id ?? null,
      },
    });

    await publishDomainEvent("reservation.created", {
      reservationId: reservation.id,
      userId,
      chargerId: id,
      providerId: charger.providerId ?? null,
      startsAt: startsAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return res.status(200).json({
      pointid: String(id),
      status: "reserved",
      reservationendtime: expiresAt.toISOString().replace("T", " ").substring(0, 16),
      reservationId: reservation.id,
      preAuthSuccess: Boolean(intent?.id),
    });
  } catch (err: any) {
    console.error("[reserve] error:", err);
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

const handleCancel = async (req: Request, res: Response) => {
  try {
    console.log("[cancel] incoming request", { path: req.path, params: req.params });

    const id = Number(req.params.id);
    if (isNaN(id)) {
      const err = makeErrorLog(req, 400, `Invalid charger id '${req.params.id}'`);
      return res.status(400).json(err);
    }

    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const reservation = await prisma.reservation.findFirst({
      where: {
        chargerId: id,
        userId,
        status: ReservationStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });

    if (!reservation) {
      const err = makeErrorLog(req, 404, `Active reservation not found for charger ${id} and user`);
      return res.status(404).json(err);
    }

    if (reservation.paymentIntentId) {
      try {
        await cancelPreAuth(reservation.paymentIntentId);
      } catch (e) {
        console.error("[cancel] failed to cancel pre-auth:", e);
      }
    }

    // Charger.status is reset to AVAILABLE by charger-service via the
    // reservation.cancelled event (event-driven, no direct cross-service DB writes).
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CANCELLED },
    });

    await cancelReservationRedis({ userId, chargerId: id });

    await publishDomainEvent("reservation.cancelled", {
      reservationId: reservation.id,
      userId,
      chargerId: id,
      providerId: (await getChargerDetails(id))?.providerId ?? null,
      cancelledAt: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, chargerId: id });
  } catch (err: any) {
    console.error("[cancel] error:", err);
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.post("/:id/cancel", verifyToken, handleCancel);
router.post("/:id/:minutes", verifyToken, handleReserve);
router.post("/:id", verifyToken, handleReserve);

export default router;
