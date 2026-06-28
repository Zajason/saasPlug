import { Router } from "express";
import prisma from "../prisma/client.ts";
import { ChargerStatus } from "@prisma/client";
import { getStatusOverlay, getUserReservedChargerId } from "../services/availabilityRedis.ts";
import { verifyToken } from "../middleware/verifyToken.ts";

const router = Router();

/** Optional auth: if Authorization exists, verifyToken sets req.userId; otherwise let it pass */
function optionalAuth(req: any, res: any, next: any) {
  const auth = req.headers?.authorization;
  if (!auth) return next();
  return (verifyToken as any)(req, res, () => next());
}
router.use(optionalAuth);

/** Helpers */
function parseCommaList(v?: string) {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
const toNum = (v: unknown) => (v === undefined ? undefined : Number(v));
function deg2rad(d: number) { return (d * Math.PI) / 180; }
function haversineKm(aLat:number,aLng:number,bLat:number,bLng:number){
  const R=6371;
  const dLat=deg2rad(bLat-aLat);
  const dLng=deg2rad(bLng-aLng);
  const s=Math.sin(dLat/2)**2 + Math.cos(deg2rad(aLat))*Math.cos(deg2rad(bLat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

const dbToApiStatus = (s: ChargerStatus): "available" | "in_use" | "outage" => {
  switch (s) {
    case ChargerStatus.AVAILABLE: return "available";
    case ChargerStatus.IN_USE: return "in_use";
    case ChargerStatus.OUTAGE: return "outage";
  }
};

/**
 * GET /api/v1/chargers
 */
router.get("/", async (req: any, res) => {
  try {
    const q = (req.query.q as string | undefined) || undefined;
    const status = (req.query.status as "AVAILABLE" | "IN_USE" | "OUTAGE" | undefined);
    const connectorList = parseCommaList(req.query.connectorType as string | undefined);
    const minKW = toNum(req.query.minKW);
    const maxKW = toNum(req.query.maxKW);
    const lat = toNum(req.query.lat);
    const lng = toNum(req.query.lng);
    const radiusKm = toNum(req.query.radiusKm);
    const sort = (req.query.sort as "distance" | "power" | "name" | undefined);
    const order = (req.query.order as "asc" | "desc" | undefined) ?? "asc";
    const page = Math.max(1, toNum(req.query.page) ?? 1);
    const pageSize = Math.min(100, Math.max(1, toNum(req.query.pageSize) ?? 20));

    const where: any = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ];
    }

    if (status) where.status = status;

    if (connectorList.length) where.connectorType = { in: connectorList };

    if (minKW || maxKW) {
      where.maxKW = {};
      if (minKW !== undefined) where.maxKW.gte = minKW;
      if (maxKW !== undefined) where.maxKW.lte = maxKW;
    }

    let useGeo = false;
    if (lat !== undefined && lng !== undefined && radiusKm !== undefined && radiusKm > 0) {
      useGeo = true;
      const dLat = radiusKm / 111;
      const dLng = radiusKm / (111 * Math.cos(deg2rad(lat)));
      where.AND = [
        ...(where.AND ?? []),
        { lat: { gte: lat - dLat, lte: lat + dLat } },
        { lng: { gte: lng - dLng, lte: lng + dLng } },
      ];
    }

    const total = await prisma.charger.count({ where });

    let orderBy: any = undefined;
    if (sort === "power") orderBy = { maxKW: order };
    if (sort === "name") orderBy = { name: order };

    const rows = await prisma.charger.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { pricingProfile: true },
    });

    const ids = rows.map((c) => c.id);
    const overlay = await getStatusOverlay(ids);

    const userId = req.userId ? Number(req.userId) : null;
    const myReservedChargerId = userId ? await getUserReservedChargerId(userId) : null;

    let items = rows.map((c) => {
      const latNum = Number(c.lat);
      const lngNum = Number(c.lng);

      const baseStatus = dbToApiStatus(c.status);
      const live = overlay.get(c.id);

      const base: any = {
        id: c.id,
        name: c.name,
        address: c.address,
        lat: latNum,
        lng: lngNum,
        connectorType: c.connectorType,
        maxKW: c.maxKW,
        status: live ?? baseStatus, // ✅ Redis overrides DB
        pricingProfileId: c.pricingProfileId ?? null,
        providerName: c.providerName,
        kwhprice: Number(c.kwhprice),
        reserved_by_me: userId ? myReservedChargerId === c.id : false,
      };

      if (useGeo) {
        base.distanceKm = haversineKm(lat!, lng!, latNum, lngNum);
      }
      return base;
    });

    if (sort === "distance") {
      items.sort((a: any, b: any) => {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return order === "desc" ? db - da : da - db;
      });
    }

    res.json({ items, page, pageSize, total });
  } catch (err) {
    console.error("GET /chargers error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid charger ID" });

    const charger = await prisma.charger.findUnique({
      where: { id },
      include: { pricingProfile: true },
    });

    if (!charger) return res.status(204).send();

    // overlay
    const overlay = await getStatusOverlay([id]);
    const live = overlay.get(id);

    const userId = req.userId ? Number(req.userId) : null;
    const myReservedChargerId = userId ? await getUserReservedChargerId(userId) : null;

    res.json({
      id: charger.id,
      name: charger.name,
      address: charger.address,
      lat: Number(charger.lat),
      lng: Number(charger.lng),
      connectorType: charger.connectorType,
      maxKW: charger.maxKW,
      kwhprice: Number(charger.kwhprice),
      providerName: charger.providerName,
      providerId: charger.providerId ?? null,
      status: live ?? dbToApiStatus(charger.status),
      pricingProfileId: charger.pricingProfileId ?? null,
      reserved_by_me: userId ? myReservedChargerId === charger.id : false,
    });
  } catch (err) {
    console.error("GET /chargers/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
