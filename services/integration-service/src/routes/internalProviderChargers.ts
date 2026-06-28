import { Router } from "express";
import prisma from "../prisma/client.ts";
import { getAdapter } from "../adapters/externalProviderApi.ts";

const router = Router();

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/provider-chargers", async (req, res) => {
  const providerId = req.query.providerId !== undefined ? parseId(req.query.providerId) : null;
  if (req.query.providerId !== undefined && !providerId) {
    return res.status(400).json({ error: "Invalid providerId" });
  }

  try {
    const items = await prisma.providerCharger.findMany({
      where: providerId ? { providerId } : {},
      orderBy: [{ providerId: "asc" }, { id: "asc" }],
      include: { charger: true },
    });

    return res.json({
      providerId,
      count: items.length,
      chargers: items.map((item) => ({
        id: item.id,
        providerId: item.providerId,
        externalProvider: item.externalProvider,
        externalId: item.externalId,
        chargerId: item.chargerId,
        lastSyncedAt: item.lastSyncedAt.toISOString(),
        charger: item.charger
          ? {
              id: item.charger.id,
              name: item.charger.name,
              address: item.charger.address,
              lat: Number(item.charger.lat),
              lng: Number(item.charger.lng),
              status: item.charger.status,
              connectorType: item.charger.connectorType,
              maxKW: item.charger.maxKW,
              kwhprice: item.charger.kwhprice,
              providerId: item.charger.providerId,
              providerName: item.charger.providerName,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("[internal/provider-chargers] error:", error);
    return res.status(500).json({ error: "Failed to load synced provider chargers" });
  }
});

router.post("/provider-chargers/:chargerId/reserve", async (req, res) => {
  const chargerId = parseId(req.params.chargerId);
  const minutesRaw = Number(req.body?.minutes ?? req.query.minutes);
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(minutesRaw, 60) : 30;

  if (!chargerId) return res.status(400).json({ error: "Invalid charger ID" });

  try {
    const mapping = await prisma.providerCharger.findFirst({
      where: { chargerId },
      orderBy: { id: "asc" },
    });

    if (!mapping) {
      return res.status(404).json({ error: "No external provider mapping found for charger" });
    }

    const config = await prisma.providerApiConfig.findFirst({
      where: {
        providerId: mapping.providerId,
        externalProvider: mapping.externalProvider,
        enabled: true,
      },
    });

    if (!config) {
      return res.status(409).json({ error: "External provider API is not configured or enabled" });
    }

    const adapter = getAdapter(config.externalProvider, {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });

    await adapter.reserveCharger(mapping.externalId, minutes);

    return res.json({
      ok: true,
      providerId: mapping.providerId,
      externalProvider: mapping.externalProvider,
      externalId: mapping.externalId,
      minutes,
    });
  } catch (error: any) {
    console.error("[internal/provider-chargers/reserve] error:", error);
    return res.status(502).json({
      error: "Failed to reserve charger through external provider API",
      details: error.message,
    });
  }
});

export default router;
