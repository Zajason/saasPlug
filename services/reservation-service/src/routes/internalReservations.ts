import express, { Request, Response } from "express";
import { ReservationStatus } from "@prisma/client";
import prisma from "../prisma/client.ts";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";

const router = express.Router();

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseIdList(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return [];
  return value
    .split(",")
    .map((part) => parseId(part.trim()))
    .filter((id): id is number => id !== null);
}

function parseDateParam(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.substring(0, 4));
  const month = Number(value.substring(4, 6)) - 1;
  const day = Number(value.substring(6, 8));
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function expireReservations(chargerIds?: number[]) {
  const now = new Date();
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.ACTIVE,
      expiresAt: { lt: now },
      ...(chargerIds && chargerIds.length > 0 ? { chargerId: { in: chargerIds } } : {}),
    },
    select: { id: true, userId: true, chargerId: true, expiresAt: true },
  });

  if (expiredReservations.length === 0) return;

  await prisma.reservation.updateMany({
    where: { id: { in: expiredReservations.map((reservation) => reservation.id) } },
    data: { status: ReservationStatus.EXPIRED },
  });

  await Promise.all(
    expiredReservations.map((reservation) =>
      publishDomainEvent("reservation.expired", {
        reservationId: reservation.id,
        userId: reservation.userId,
        chargerId: reservation.chargerId,
        expiredAt: reservation.expiresAt.toISOString(),
      }),
    ),
  );
}

function serializeReservation(reservation: {
  id: number;
  userId: number;
  chargerId: number;
  startsAt: Date;
  expiresAt: Date;
  status: ReservationStatus;
}) {
  return {
    id: reservation.id,
    userId: reservation.userId,
    chargerId: reservation.chargerId,
    startsAt: reservation.startsAt.toISOString(),
    expiresAt: reservation.expiresAt.toISOString(),
    status: reservation.status,
  };
}

router.get("/active", async (req: Request, res: Response) => {
  const userId = parseId(req.query.userId);
  const chargerId = parseId(req.query.chargerId);
  const chargerIds = parseIdList(req.query.chargerIds);
  const scopedChargerIds = chargerId ? [chargerId] : chargerIds;

  try {
    await expireReservations(scopedChargerIds);

    const reservations = await prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        ...(userId ? { userId } : {}),
        ...(scopedChargerIds.length > 0 ? { chargerId: { in: scopedChargerIds } } : {}),
      },
      orderBy: { expiresAt: "desc" },
    });

    return res.json({ reservations: reservations.map(serializeReservation) });
  } catch (error: any) {
    console.error("[internal/reservations/active] error:", error);
    return res.status(500).json({ error: "Failed to load active reservations", details: error.message });
  }
});

router.get("/history/:chargerId/:from/:to", async (req: Request, res: Response) => {
  const chargerId = parseId(req.params.chargerId);
  const fromDate = parseDateParam(firstParam(req.params.from));
  const toDate = parseDateParam(firstParam(req.params.to), true);

  if (!chargerId || !fromDate || !toDate) {
    return res.status(400).json({ error: "Invalid charger ID or date range" });
  }

  try {
    await expireReservations([chargerId]);

    const reservations = await prisma.reservation.findMany({
      where: {
        chargerId,
        startsAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { startsAt: "desc" },
    });

    return res.json({ reservations: reservations.map(serializeReservation) });
  } catch (error: any) {
    console.error("[internal/reservations/history] error:", error);
    return res.status(500).json({ error: "Failed to load reservation history", details: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid reservation ID" });

  try {
    await expireReservations();

    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });

    return res.json({ reservation: serializeReservation(reservation) });
  } catch (error: any) {
    console.error("[internal/reservations/get] error:", error);
    return res.status(500).json({ error: "Failed to load reservation", details: error.message });
  }
});

router.post("/:id/expire", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid reservation ID" });

  try {
    const reservation = await prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.EXPIRED },
    });

    await publishDomainEvent("reservation.expired", {
      reservationId: reservation.id,
      userId: reservation.userId,
      chargerId: reservation.chargerId,
      expiredAt: new Date().toISOString(),
    });

    return res.json({ reservation: serializeReservation(reservation) });
  } catch (error: any) {
    console.error("[internal/reservations/expire] error:", error);
    return res.status(500).json({ error: "Failed to expire reservation", details: error.message });
  }
});

export default router;
