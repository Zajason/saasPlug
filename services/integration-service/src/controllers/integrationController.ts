import { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import prisma from "../prisma/client.ts";
import {
  DEFAULT_BASE_URLS,
  getAdapter,
  isExternalProvider,
  type ExternalProviderName,
  type NormalizedCharger,
} from "../adapters/externalProviderApi.ts";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";

const SYNC_EVENT_TYPE = "CHARGERS_SYNCED";
const PROVIDER_SERVICE_URL = process.env.PROVIDER_SERVICE_URL;

// Resolve the caller to a real Provider.id via ProviderAccount.
// Falls back to a direct HTTP call to provider-service if the local DB
// hasn't been populated yet (e.g. RabbitMQ event not yet processed).
const resolveProviderId = async (req: Request): Promise<number | null> => {
  const account = await prisma.providerAccount.findUnique({
    where: { userId: req.userId! },
  });
  if (account) return account.providerId;

  // Fallback: ask provider-service directly and cache the result locally
  if (!PROVIDER_SERVICE_URL) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  try {
    const resp = await fetch(`${PROVIDER_SERVICE_URL}/me`, {
      headers: { Authorization: authHeader },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { provider?: { id: number } };
    const providerId = data.provider?.id;
    if (!providerId) return null;

    // Cache in local DB so subsequent calls don't need the HTTP round-trip
    await prisma.providerAccount.upsert({
      where: { userId: req.userId! },
      update: { providerId },
      create: { userId: req.userId!, providerId, role: "OWNER" },
    });
    return providerId;
  } catch {
    return null;
  }
};

// ---------- serializers ----------
const maskSecret = (value: string) =>
  value.length <= 4 ? "****" : `****${value.slice(-4)}`;

const serializeConfig = (c: any) => ({
  id: c.id,
  providerId: c.providerId,
  externalProvider: c.externalProvider,
  baseUrl: c.baseUrl,
  apiKey: maskSecret(c.apiKey), // never expose the real key
  enabled: c.enabled,
  lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

const serializeProviderCharger = (pc: any) => ({
  id: pc.id,
  providerId: pc.providerId,
  externalProvider: pc.externalProvider,
  externalId: pc.externalId,
  chargerId: pc.chargerId,
  lastSyncedAt: pc.lastSyncedAt.toISOString(),
  charger: pc.charger
    ? {
        id: pc.charger.id,
        name: pc.charger.name,
        address: pc.charger.address ?? null,
        lat: Number(pc.charger.lat),
        lng: Number(pc.charger.lng),
        status: pc.charger.status,
        connectorType: pc.charger.connectorType,
        maxKW: pc.charger.maxKW,
        kwhprice: pc.charger.kwhprice,
      }
    : null,
});

const serializeSubscription = (s: any) => ({
  id: s.id,
  providerId: s.providerId,
  url: s.url,
  secret: maskSecret(s.secret), // never expose the real secret
  eventTypes: s.eventTypes,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

const serializeEvent = (e: any) => ({
  id: e.id,
  subscriptionId: e.subscriptionId,
  type: e.type,
  payloadJson: e.payloadJson,
  deliveryStatus: e.deliveryStatus,
  retries: e.retries,
  createdAt: e.createdAt.toISOString(),
});

// ---------- #39 ConfigureProviderAPI ----------
const configureSchema = z.object({
  externalProvider: z.string(),
  baseUrl: z.url().optional(),
  apiKey: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const configureProviderApi = async (req: Request, res: Response) => {
  const parsed = configureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }
  if (!isExternalProvider(parsed.data.externalProvider)) {
    return res
      .status(400)
      .json({ error: "externalProvider must be one of: redPlug, greenPlug, bluePlug" });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const externalProvider = parsed.data.externalProvider as ExternalProviderName;
    const baseUrl = parsed.data.baseUrl ?? DEFAULT_BASE_URLS[externalProvider];
    const apiKey =
      parsed.data.apiKey ?? process.env.INTEGRATION_DEFAULT_API_KEY ?? "sk_saas_replace_me";
    const enabled = parsed.data.enabled ?? true;

    const config = await prisma.providerApiConfig.upsert({
      where: { providerId_externalProvider: { providerId, externalProvider } },
      update: { baseUrl, apiKey, enabled },
      create: { providerId, externalProvider, baseUrl, apiKey, enabled },
    });

    return res.status(201).json({ config: serializeConfig(config) });
  } catch (error) {
    console.error("configureProviderApi error:", error);
    return res.status(500).json({ error: "Failed to save provider API configuration" });
  }
};

export const listProviderApiConfigs = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const configs = await prisma.providerApiConfig.findMany({
      where: { providerId },
      orderBy: { id: "asc" },
    });
    return res.json({ providerId, configs: configs.map(serializeConfig) });
  } catch (error) {
    console.error("listProviderApiConfigs error:", error);
    return res.status(500).json({ error: "Failed to load provider API configurations" });
  }
};

// ---------- #41 / #42 Charger sync + persistence ----------
// Upserts each normalized charger in integration-service's own DB so that
// listSyncedChargers can return data immediately, then also publishes the
// charger.upserted event so charger-service keeps its own copy in sync.
async function storeChargers(
  providerId: number,
  providerName: string,
  externalProvider: string,
  chargers: NormalizedCharger[],
): Promise<{ total: number }> {
  for (const nc of chargers) {
    const chargerData = {
      providerName,
      providerId,
      name: nc.name,
      address: nc.address ?? null,
      lat: nc.lat,
      lng: nc.lng,
      connectorType: nc.connectorType,
      maxKW: nc.maxKW,
      status: nc.status,
      kwhprice: nc.kwhPrice,
    };

    // Upsert Charger + ProviderCharger in integration-service's own DB
    const existingPc = await prisma.providerCharger.findUnique({
      where: {
        providerId_externalProvider_externalId: {
          providerId,
          externalProvider,
          externalId: nc.externalId,
        },
      },
    });

    if (existingPc) {
      const chargerExists = existingPc.chargerId
        ? await prisma.charger.findUnique({ where: { id: existingPc.chargerId }, select: { id: true } })
        : null;
      if (chargerExists) {
        await prisma.charger.update({ where: { id: existingPc.chargerId! }, data: chargerData });
        await prisma.providerCharger.update({
          where: { id: existingPc.id },
          data: { lastSyncedAt: new Date() },
        });
      } else {
        const charger = await prisma.charger.create({ data: chargerData });
        await prisma.providerCharger.update({
          where: { id: existingPc.id },
          data: { chargerId: charger.id, lastSyncedAt: new Date() },
        });
      }
    } else {
      const charger = await prisma.charger.create({ data: chargerData });
      await prisma.providerCharger.create({
        data: {
          providerId,
          externalProvider,
          externalId: nc.externalId,
          chargerId: charger.id,
        },
      });
    }

    // Also notify charger-service so it can maintain its own copy
    await publishDomainEvent("charger.upserted", {
      providerId,
      providerName,
      externalProvider,
      externalId: nc.externalId,
      name: nc.name,
      address: nc.address,
      lat: nc.lat,
      lng: nc.lng,
      connectorType: nc.connectorType,
      maxKW: nc.maxKW,
      status: nc.status,
      kwhPrice: nc.kwhPrice,
    });
  }

  return { total: chargers.length };
}

// #43: record a WebhookEvent for every subscription interested in the sync.
async function recordSyncWebhookEvents(
  providerId: number,
  externalProvider: string,
  summary: { total: number },
): Promise<number> {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { providerId, eventTypes: { has: SYNC_EVENT_TYPE } },
  });

  for (const subscription of subscriptions) {
    await prisma.webhookEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SYNC_EVENT_TYPE,
        payloadJson: { externalProvider, ...summary },
        deliveryStatus: "PENDING",
      },
    });
  }
  return subscriptions.length;
}

const syncSchema = z.object({
  externalProvider: z.string().optional(),
});

export const syncChargers = async (req: Request, res: Response) => {
  const parsed = syncSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });

    const configs = await prisma.providerApiConfig.findMany({
      where: {
        providerId,
        enabled: true,
        ...(parsed.data.externalProvider
          ? { externalProvider: parsed.data.externalProvider }
          : {}),
      },
    });

    if (configs.length === 0) {
      return res.status(400).json({
        error: "No enabled provider API configuration found. Configure one first via POST /config.",
      });
    }

    const synced = [];
    for (const config of configs) {
      const adapter = getAdapter(config.externalProvider, {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      const normalized = await adapter.listChargers();
      const summary = await storeChargers(
        providerId,
        provider.name,
        config.externalProvider,
        normalized,
      );
      await prisma.providerApiConfig.update({
        where: { id: config.id },
        data: { lastSyncedAt: new Date() },
      });
      const eventQueued = await publishDomainEvent("integration.chargers.synced", {
        providerId,
        externalProvider: config.externalProvider,
        ...summary,
      });
      const webhookEventsRecorded = eventQueued
        ? 0
        : await recordSyncWebhookEvents(providerId, config.externalProvider, summary);
      synced.push({
        externalProvider: config.externalProvider,
        ...summary,
        eventQueued,
        webhookEventsRecorded,
      });
    }

    return res.json({ providerId, synced });
  } catch (error) {
    console.error("syncChargers error:", error);
    return res.status(500).json({ error: "Failed to sync provider chargers" });
  }
};

export const listSyncedChargers = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const items = await prisma.providerCharger.findMany({
      where: { providerId },
      orderBy: { id: "asc" },
    });
    const chargerIds = items.map((pc) => pc.chargerId).filter((id): id is number => id !== null);
    const chargers = chargerIds.length
      ? await prisma.charger.findMany({ where: { id: { in: chargerIds } } })
      : [];
    const chargerMap = new Map(chargers.map((c) => [c.id, c]));
    return res.json({
      providerId,
      count: items.length,
      chargers: items.map((pc) =>
        serializeProviderCharger({ ...pc, charger: pc.chargerId ? (chargerMap.get(pc.chargerId) ?? null) : null }),
      ),
    });
  } catch (error) {
    console.error("listSyncedChargers error:", error);
    return res.status(500).json({ error: "Failed to load synced chargers" });
  }
};

// ---------- #43 Webhook persistence ----------
const webhookSchema = z.object({
  url: z.url(),
  secret: z.string().min(1).optional(),
  eventTypes: z.array(z.string()).min(1).optional(),
});

export const createWebhookSubscription = async (req: Request, res: Response) => {
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const subscription = await prisma.webhookSubscription.create({
      data: {
        providerId,
        url: parsed.data.url,
        secret: parsed.data.secret ?? randomBytes(16).toString("hex"),
        eventTypes: parsed.data.eventTypes ?? [SYNC_EVENT_TYPE],
      },
    });
    return res.status(201).json({ subscription: serializeSubscription(subscription) });
  } catch (error) {
    console.error("createWebhookSubscription error:", error);
    return res.status(500).json({ error: "Failed to create webhook subscription" });
  }
};

export const listWebhookSubscriptions = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const subscriptions = await prisma.webhookSubscription.findMany({
      where: { providerId },
      orderBy: { id: "asc" },
    });
    return res.json({ providerId, subscriptions: subscriptions.map(serializeSubscription) });
  } catch (error) {
    console.error("listWebhookSubscriptions error:", error);
    return res.status(500).json({ error: "Failed to load webhook subscriptions" });
  }
};

export const listWebhookEvents = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const subscriptions = await prisma.webhookSubscription.findMany({
      where: { providerId },
      select: { id: true },
    });
    const events = await prisma.webhookEvent.findMany({
      where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return res.json({ providerId, count: events.length, events: events.map(serializeEvent) });
  } catch (error) {
    console.error("listWebhookEvents error:", error);
    return res.status(500).json({ error: "Failed to load webhook events" });
  }
};
