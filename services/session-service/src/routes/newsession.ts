import express, { Request, Response } from "express";
import prisma from "../prisma/client.js";
import { makeErrorLog } from "../middleware/errorHandler.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { SessionStatus } from "@prisma/client";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";
import { getChargerStatusRedis } from "../services/availabilityRedis.ts";

const router = express.Router();

// Setup the service URLs from environment variables
const CHARGER_SERVICE_URL = process.env.CHARGER_SERVICE_URL || "http://localhost:8084";
const RESERVATION_SERVICE_URL = process.env.RESERVATION_SERVICE_URL || "http://localhost:8085";

type ChargerDetails = {
    providerId?: number | null;
    kwhprice?: number;
    maxKW?: number;
};

type ActiveReservation = {
    id: number;
    userId: number;
    chargerId: number;
};

const handleNewSession = async (req: Request, res: Response) => {
  try {
    const { 
        pointid,
        starttime, 
        endtime, 
        startsoc, 
        endsoc, 
        totalkwh, 
        kwhprice, 
        amount 
    } = req.body;

    if (!pointid || !starttime || !endtime || !totalkwh || kwhprice === undefined || amount === undefined) {
        const err = makeErrorLog(req, 400, "Missing required fields");
        return res.status(400).json(err);
    }

    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const chargerId = Number(pointid);

    // 1. Ask the Charger Service if this charger even exists
    const chargerRes = await fetch(`${CHARGER_SERVICE_URL}/api/v1/chargers/${chargerId}`);
    if (!chargerRes.ok) {
        return res.status(400).json(makeErrorLog(req, 400, "Invalid pointid: Charger not found"));
    }
    const chargerData = (await chargerRes.json()) as ChargerDetails;

    // 2. Check the real-time status in Redis
    const currentStatus = await getChargerStatusRedis(chargerId);

    if (currentStatus !== "available") {
        // 3. If not available, ask the Reservation Service if THIS user has it reserved
        const resCheck = await fetch(`${RESERVATION_SERVICE_URL}/api/v1/internal/reservations/active?chargerId=${chargerId}`);
        let myReservation = null;
        
        if (resCheck.ok) {
            const activeReservationsPayload = (await resCheck.json()) as { reservations?: ActiveReservation[] };
            const activeReservations = activeReservationsPayload.reservations ?? [];
            myReservation = activeReservations.find((r: any) => r.userId === userId);
        }

        if (myReservation) {
            // Tell the Reservation Service to expire it via API
            await fetch(`${RESERVATION_SERVICE_URL}/api/v1/internal/reservations/${myReservation.id}/expire`, {
                method: "POST"
            });
        } else {
            const latestSession = await prisma.session.findFirst({
                where: { chargerId },
                orderBy: { startedAt: "desc" },
                select: { userId: true }
            });

            if (currentStatus === "outage" || latestSession?.userId !== userId) {
                const msg = currentStatus === "outage" 
                    ? "Charger is out of order" 
                    : "Charger is currently in use or reserved by another user";
                
                return res.status(403).json(makeErrorLog(req, 403, msg));
            }
        }
    }

    const start = new Date(starttime);
    const end = new Date(endtime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        const err = makeErrorLog(req, 400, "Invalid date format");
        return res.status(400).json(err);
    }

    // Create the session!
    const session = await prisma.session.create({
        data: {
            userId: userId,
            chargerId: chargerId,
            startedAt: start,
            endedAt: end,
            kWh: Number(totalkwh),
            pricePerKWh: Number(kwhprice),
            costEur: Number(amount),
            status: SessionStatus.COMPLETED, 
        }
    });

    // 🚀 Publish the event so the Billing service knows to charge for this!
    await publishDomainEvent("session.stopped", {
        sessionId: session.id,
        userId,
        chargerId,
        providerId: chargerData.providerId ?? null,
        endedAt: end.toISOString(),
        kWh: Number(totalkwh),
        costEur: Number(amount),
        status: SessionStatus.COMPLETED,
    });

    return res.status(200).send();

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.post("/", verifyToken, handleNewSession);

export default router;
