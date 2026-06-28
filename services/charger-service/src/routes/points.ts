import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { optionalToken } from "../middleware/optionalToken.ts";
import { ChargerStatus } from "@prisma/client";
import { getActiveReservations } from "../services/internalReadClients.ts";

const router = express.Router();

const apiToDbStatus: Record<string, ChargerStatus> = {
  available: ChargerStatus.AVAILABLE,
  in_use: ChargerStatus.IN_USE,
  charging: ChargerStatus.IN_USE,
  reserved: ChargerStatus.IN_USE,
  outage: ChargerStatus.OUTAGE,
  offline: ChargerStatus.OUTAGE,
  outoforder: ChargerStatus.OUTAGE,
};

const getStatusString = (db: ChargerStatus): string => {
  switch (db) {
    case ChargerStatus.AVAILABLE: return "available";
    case ChargerStatus.IN_USE: return "in_use";
    case ChargerStatus.OUTAGE: return "outage";
    default: return "unknown";
  }
};

const allowedStatuses = Object.keys(apiToDbStatus).join(", ");
const reservationSupportedProviders = new Set(["redPlug", "greenPlug", "bluePlug"]);

function getExternalProvider(charger: {
  providerName?: string | null;
}) {
  return charger.providerName ?? null;
}

function supportsReservation(externalProvider: string | null) {
  return externalProvider ? reservationSupportedProviders.has(externalProvider) : false;
}

// GET /points
router.get("/", optionalToken, async (req, res) => {
  try {
    const currentUserId = req.userId; // Το ID του χρήστη που κάνει το αίτημα
    const { status, providerId: providerIdParam } = req.query;
    let where: { status?: ChargerStatus; providerId?: number } = {};

    if (status !== undefined) {
      const statusStr = String(status).toLowerCase();
      if (!(statusStr in apiToDbStatus)) {
        return res.status(400).json(makeErrorLog(req, 400, `Invalid status. Allowed: ${allowedStatuses}`));
      }
      where.status = apiToDbStatus[statusStr];
    }

    if (providerIdParam !== undefined) {
      const pid = Number(providerIdParam);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json(makeErrorLog(req, 400, "Invalid providerId"));
      }
      where.providerId = pid;
    }

    const chargers = await prisma.charger.findMany({
        where,
        orderBy: { id: 'asc' }
    });

    if (chargers.length === 0) return res.status(200).json([]);

    // Only fetch reservation data when a logged-in user is browsing (needed to show "reserved by me").
    // Skip the call when filtering by provider (internal/analytics use) or when no user is logged in.
    const shouldFetchReservations = currentUserId !== undefined && !providerIdParam;
    const myReservedChargerIds = new Set<number>();
    if (shouldFetchReservations) {
      const activeReservations = await getActiveReservations({
        userId: currentUserId,
        chargerIds: chargers.map((charger) => charger.id),
      });
      for (const r of activeReservations) {
        if (r.userId === currentUserId) myReservedChargerIds.add(r.chargerId);
      }
    }

    const result = chargers.map((c) => {
      // Ελέγχουμε αν αυτός ο φορτιστής είναι κρατημένος από ΕΜΑΣ
      const isMine = myReservedChargerIds.has(c.id);
      const externalProvider = getExternalProvider(c);

      return {
        pointid: c.id,
        providerName: c.providerName || "unknown",
        externalProvider,
        name: c.name,
        address: c.address ?? "",
        connectorType: c.connectorType,
        lon: String(c.lng),
        lat: String(c.lat),
        status: getStatusString(c.status),
        cap: c.maxKW,
        kwhprice: c.kwhprice,
        reserved_by_me: isMine,
        reservationSupported: supportsReservation(externalProvider)
      };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
});

// GET /points/:id
router.get("/:id", optionalToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json(makeErrorLog(req, 400, "Invalid ID"));

    const charger = await prisma.charger.findUnique({
      where: { id },
    });
    if (!charger) return res.status(404).json(makeErrorLog(req, 404, "Not found"));

    const activeReservations = await getActiveReservations({ chargerId: charger.id });
    const activeReservation = activeReservations[0] ?? null;
    
    // Έλεγχος αν η κράτηση είναι δική μου
    const currentUserId = req.userId; // Βεβαιώσου ότι το verifyToken το δίνει αυτό
    const isMine = activeReservation?.userId === currentUserId;

    const resEndTime = activeReservation
      ? activeReservation.expiresAt.replace("T", " ").substring(0, 16)
      : null;
    const externalProvider = getExternalProvider(charger);

    const result = {
      pointid: charger.id,
      providerName: charger.providerName || "unknown",
      externalProvider,
      name: charger.name,
      address: charger.address ?? "",
      connectorType: charger.connectorType,
      lon: String(charger.lng),
      lat: String(charger.lat),
      status: getStatusString(charger.status), // Χρήση της getStatusString που έχουμε πάνω
      cap: charger.maxKW,
      kwhprice: charger.kwhprice,
      reservationendtime: resEndTime,
      reserved_by_me: isMine,
      reservationSupported: supportsReservation(externalProvider)
    };

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json(makeErrorLog(req, 500, "Internal Error", err.message));
  }
});

export default router;
