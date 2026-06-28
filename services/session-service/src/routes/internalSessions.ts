import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";

const router = express.Router();

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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

router.get("/history/:chargerId/:from/:to", async (req: Request, res: Response) => {
  const chargerId = parseId(req.params.chargerId);
  const fromDate = parseDateParam(firstParam(req.params.from));
  const toDate = parseDateParam(firstParam(req.params.to), true);

  if (!chargerId || !fromDate || !toDate) {
    return res.status(400).json({ error: "Invalid charger ID or date range" });
  }

  try {
    const sessions = await prisma.session.findMany({
      where: {
        chargerId,
        startedAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { startedAt: "desc" },
    });

    return res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        userId: session.userId,
        chargerId: session.chargerId,
        reservationId: session.reservationId,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt?.toISOString() ?? null,
        status: session.status,
      })),
    });
  } catch (error: any) {
    console.error("[internal/sessions/history] error:", error);
    return res.status(500).json({ error: "Failed to load session history", details: error.message });
  }
});

export default router;
