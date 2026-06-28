import { Request, Response } from "express";
import { ExportFormat, ExportStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../prisma/client.ts";

const dayMs = 24 * 60 * 60 * 1000;
const PROVIDER_SERVICE_URL = process.env.PROVIDER_SERVICE_URL;
const CHARGER_SERVICE_URL = process.env.CHARGER_SERVICE_URL;
const INTEGRATION_SERVICE_URL = process.env.INTEGRATION_SERVICE_URL ?? "http://integration-service:8090";

type ChargerPoint = {
  pointid: number;
  name: string;
  address?: string;
  lat: string | number;
  lon?: string | number;
  lng?: string | number;
  status?: string;
  connectorType?: string;
  cap?: number;
  kwhprice?: number;
  providerId?: number;
  providerName?: string;
};

type SyncedProviderCharger = {
  providerId: number;
  externalProvider: string;
  externalId: string;
  chargerId: number | null;
  charger: {
    id: number;
    name: string;
    address?: string | null;
    lat: number;
    lng: number;
    status?: string;
    connectorType?: string;
    maxKW?: number;
    kwhprice?: number;
    providerId?: number | null;
    providerName?: string | null;
  } | null;
};

function normalizeChargerStatus(status?: string) {
  const normalized = (status ?? "AVAILABLE").toLowerCase();
  if (["in_use", "charging", "reserved"].includes(normalized)) return "IN_USE";
  if (["outage", "offline", "malfunction", "outoforder"].includes(normalized)) return "OUTAGE";
  return "AVAILABLE";
}

async function fetchChargersFromService(providerId?: number): Promise<ChargerPoint[]> {
  if (!CHARGER_SERVICE_URL) return [];
  try {
    const url = providerId
      ? `${CHARGER_SERVICE_URL}/api/v1/points?providerId=${providerId}`
      : `${CHARGER_SERVICE_URL}/api/v1/points`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return [];
    const data = await resp.json() as ChargerPoint[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchSyncedChargersFromIntegration(providerId?: number): Promise<ChargerPoint[]> {
  if (!INTEGRATION_SERVICE_URL) return [];
  try {
    const query = providerId ? `?providerId=${providerId}` : "";
    const resp = await fetch(`${INTEGRATION_SERVICE_URL}/api/v1/internal/provider-chargers${query}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { chargers?: SyncedProviderCharger[] };
    const chargers = Array.isArray(data.chargers) ? data.chargers : [];
    return chargers
      .filter((item) => item.charger)
      .map((item) => ({
        pointid: item.chargerId ?? item.charger!.id,
        name: item.charger!.name,
        address: item.charger!.address ?? undefined,
        lat: item.charger!.lat,
        lng: item.charger!.lng,
        status: normalizeChargerStatus(item.charger!.status),
        connectorType: item.charger!.connectorType,
        cap: item.charger!.maxKW,
        kwhprice: item.charger!.kwhprice,
        providerId: item.providerId,
        providerName: item.charger!.providerName ?? item.externalProvider,
      }));
  } catch {
    return [];
  }
}

const dateQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  providerId: z.coerce.number().int().positive().optional(),
});

const exportSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  providerId: z.number().int().positive().optional(),
  scope: z.enum(["PROVIDER", "GLOBAL"]).optional(),
  exportType: z
    .enum(["USAGE_RECORDS", "PROVIDER_DAILY", "PROVIDER_CHARGERS", "GLOBAL_PROVIDERS", "GLOBAL_CHARGERS"])
    .default("USAGE_RECORDS"),
  format: z.enum(["CSV", "JSON"]).default("CSV"),
});

const exportListSchema = z.object({
  providerId: z.coerce.number().int().positive().optional(),
  scope: z.enum(["PROVIDER", "GLOBAL"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const exportIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}

function parsePeriod(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(end.getTime())) throw new Error("Invalid to date");

  const start = from ? new Date(from) : new Date(end.getTime() - 30 * dayMs);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid from date");
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (start > end) throw new Error("from must be before to");
  return { from: start, to: end };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDayBuckets(from: Date, to: Date) {
  const buckets: Record<string, { date: string; label: string; sessions: number; kWh: number; revenueEur: number }> = {};
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= to) {
    const key = dayKey(cursor);
    buckets[key] = {
      date: key,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(cursor),
      sessions: 0,
      kWh: 0,
      revenueEur: 0,
    };
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

async function resolveProviderId(req: Request, requestedProviderId?: number): Promise<number | null> {
  if (req.userRole === "PLATFORM_OPERATOR" && requestedProviderId) return requestedProviderId;

  const account = await prisma.providerAccount.findUnique({
    where: { userId: req.userId! },
  });
  if (account) return account.providerId;

  // Fallback: ask provider-service directly and cache results locally so
  // subsequent calls (and buildProviderReport) find Provider + ProviderAccount.
  if (!PROVIDER_SERVICE_URL) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  try {
    const resp = await fetch(`${PROVIDER_SERVICE_URL}/me`, {
      headers: { Authorization: authHeader },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      provider?: { id: number; name?: string; contactEmail?: string; status?: string };
    };
    const provider = data.provider;
    if (!provider?.id) return null;

    // Ensure Provider row exists in analytics DB so buildProviderReport can find it.
    const existing = await prisma.provider.findUnique({ where: { id: provider.id } });
    if (!existing) {
      await prisma.provider.create({
        data: {
          id: provider.id,
          name: provider.name ?? `Provider ${provider.id}`,
          contactEmail: provider.contactEmail ?? `provider-${provider.id}@saasplug.local`,
          status: (provider.status as any) ?? "PENDING",
        },
      });
    }
    await prisma.providerAccount.upsert({
      where: { userId: req.userId! },
      update: { providerId: provider.id },
      create: { userId: req.userId!, providerId: provider.id, role: "OWNER" },
    });
    return provider.id;
  } catch {
    return null;
  }
}

function serializeExportJob(job: any) {
  return {
    id: job.id,
    providerId: job.providerId ?? null,
    requestedById: job.requestedById ?? null,
    scope: job.scope,
    format: job.format,
    status: job.status,
    fileName: job.fileName ?? null,
    downloadUrl: job.downloadUrl ?? null,
    parameters: job.parameters,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  };
}

async function buildProviderReport(providerId: number, from: Date, to: Date) {
  const [provider, localChargers, liveChargers, sessions, usageRecords, invoices, apiConfigs, exportJobCount] =
    await Promise.all([
      prisma.provider.findUnique({ where: { id: providerId } }),
      prisma.charger.findMany({ where: { providerId }, orderBy: { id: "asc" } }),
      Promise.all([
        fetchSyncedChargersFromIntegration(providerId),
        fetchChargersFromService(providerId),
      ]),
      prisma.session.findMany({
        where: {
          startedAt: { gte: from, lte: to },
          charger: { providerId },
        },
        include: { charger: true },
      }),
      prisma.providerUsageRecord.findMany({
        where: { providerId, occurredAt: { gte: from, lte: to } },
        orderBy: { occurredAt: "asc" },
        include: { invoice: true },
      }),
      prisma.providerInvoice.findMany({
        where: { providerId },
        orderBy: { periodStart: "desc" },
        take: 5,
        include: { _count: { select: { usageRecords: true, payments: true } } },
      }),
      prisma.providerApiConfig.findMany({ where: { providerId }, orderBy: { id: "asc" } }),
      prisma.exportJob.count({ where: { providerId } }),
    ]);

  if (!provider) return null;

  const [syncedIntegrationChargers, liveServiceChargers] = liveChargers;
  const liveMapChargers =
    syncedIntegrationChargers.length > 0 ? syncedIntegrationChargers : liveServiceChargers;

  // Use IntegrationService's synced provider chargers first because it is the
  // source of the external API sync. Fall back to ChargerService, then local cache.
  const chargers = liveMapChargers.length > 0
    ? liveMapChargers.map((p) => ({
        id: p.pointid,
        name: p.name,
        address: p.address ?? null,
        lat: typeof p.lat === "string" ? parseFloat(p.lat) : p.lat,
        lng: typeof (p.lon ?? p.lng) === "string" ? parseFloat(String(p.lon ?? p.lng ?? "0")) : Number(p.lon ?? p.lng ?? 0),
        status: normalizeChargerStatus(p.status),
        connectorType: (p.connectorType ?? "TYPE2") as string,
        maxKW: p.cap ?? 0,
        kwhprice: p.kwhprice ?? 0.25,
        providerId,
      }))
    : localChargers.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        lat: toNumber(c.lat),
        lng: toNumber(c.lng),
        status: c.status as string,
        connectorType: c.connectorType as string,
        maxKW: c.maxKW,
        kwhprice: c.kwhprice,
        providerId,
      }));

  // For session-level analytics, we also need the local charger IDs (which session.chargerId references).
  const localChargerIdSet = new Set(localChargers.map((c) => c.id));

  const sessionUsageRecords = usageRecords.filter((record) => record.sourceType === "SESSION");
  const usageRecordSessions = sessionUsageRecords.reduce((sum, record) => sum + record.quantity, 0);
  const actualSessionCount = sessions.length;
  const sessionCount = actualSessionCount > 0 ? actualSessionCount : usageRecordSessions;
  const actualEnergy = sessions.reduce((sum, session) => sum + toNumber(session.kWh), 0);
  const estimatedEnergy = actualSessionCount > 0 ? 0 : usageRecordSessions * 18;
  const energyKWh = actualEnergy + estimatedEnergy;
  const sessionRevenue = sessions.reduce((sum, session) => sum + toNumber(session.costEur), 0);
  const usageRevenue = usageRecords.reduce((sum, record) => sum + toNumber(record.amountEur), 0);
  const revenueEur = sessionRevenue > 0 ? sessionRevenue : usageRevenue;

  const dayBuckets = buildDayBuckets(from, to);
  if (actualSessionCount > 0) {
    for (const session of sessions) {
      const key = dayKey(session.startedAt);
      if (!dayBuckets[key]) continue;
      dayBuckets[key].sessions += 1;
      dayBuckets[key].kWh += toNumber(session.kWh);
      dayBuckets[key].revenueEur += toNumber(session.costEur);
    }
  } else {
    for (const record of usageRecords) {
      const key = dayKey(record.occurredAt);
      if (!dayBuckets[key]) continue;
      const sessionsForRecord = record.sourceType === "SESSION" ? record.quantity : 0;
      dayBuckets[key].sessions += sessionsForRecord;
      dayBuckets[key].kWh += sessionsForRecord * 18;
      dayBuckets[key].revenueEur += toNumber(record.amountEur);
    }
  }

  const chargerStats = new Map<
    number,
    {
      chargerId: number;
      name: string;
      address: string | null;
      lat: number;
      lng: number;
      status: string;
      connectorType: string;
      maxKW: number;
      sessions: number;
      kWh: number;
      revenueEur: number;
    }
  >();
  for (const charger of chargers) {
    chargerStats.set(charger.id, {
      chargerId: charger.id,
      name: charger.name,
      address: charger.address,
      lat: charger.lat,
      lng: charger.lng,
      status: charger.status,
      connectorType: charger.connectorType,
      maxKW: charger.maxKW,
      sessions: 0,
      kWh: 0,
      revenueEur: 0,
    });
  }
  // Sessions reference local charger IDs; map them using the local charger id set.
  for (const session of sessions) {
    // session.chargerId refers to the local analytics DB charger id
    const localId = session.chargerId;
    if (!localId || !localChargerIdSet.has(localId)) continue;
    const item = chargerStats.get(localId);
    if (!item) continue;
    item.sessions += 1;
    item.kWh += toNumber(session.kWh);
    item.revenueEur += toNumber(session.costEur);
  }

  const statusBreakdown = chargers.reduce<Record<string, number>>((acc, charger) => {
    acc[charger.status] = (acc[charger.status] ?? 0) + 1;
    return acc;
  }, {});

  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / dayMs));
  const utilizationRate = chargers.length
    ? Math.min(100, Math.round((sessionCount / (chargers.length * days * 4)) * 100))
    : 0;

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      status: provider.status,
    },
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      chargers: chargers.length,
      activeChargers: chargers.filter((charger) => charger.status !== "OUTAGE").length,
      sessions: sessionCount,
      energyKWh: Number(energyKWh.toFixed(2)),
      revenueEur: Number(revenueEur.toFixed(2)),
      usageRecords: usageRecords.length,
      openInvoiceTotalEur: Number(
        invoices
          .filter((invoice) => ["OPEN", "OVERDUE"].includes(invoice.status))
          .reduce((sum, invoice) => sum + toNumber(invoice.totalEur), 0)
          .toFixed(2),
      ),
      avgSessionMinutes:
        actualSessionCount > 0
          ? Math.round(
              sessions.reduce((sum, session) => {
                const endedAt = session.endedAt ?? new Date(session.startedAt.getTime() + 34 * 60_000);
                return sum + (endedAt.getTime() - session.startedAt.getTime()) / 60_000;
              }, 0) / actualSessionCount,
            )
          : sessionCount > 0
            ? 34
            : 0,
      utilizationRate,
      exportJobs: exportJobCount,
    },
    usageByDay: Object.values(dayBuckets).map((bucket) => ({
      ...bucket,
      kWh: Number(bucket.kWh.toFixed(2)),
      revenueEur: Number(bucket.revenueEur.toFixed(2)),
    })),
    statusBreakdown,
    chargerMap: Array.from(chargerStats.values())
      .map((item) => ({
        ...item,
        kWh: Number(item.kWh.toFixed(2)),
        revenueEur: Number(item.revenueEur.toFixed(2)),
      })),
    chargerBreakdown: Array.from(chargerStats.values())
      .sort((a, b) => b.sessions - a.sessions || b.kWh - a.kWh)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        kWh: Number(item.kWh.toFixed(2)),
        revenueEur: Number(item.revenueEur.toFixed(2)),
      })),
    apiConfigs: apiConfigs.map((config) => ({
      externalProvider: config.externalProvider,
      enabled: config.enabled,
      lastSyncedAt: config.lastSyncedAt ? config.lastSyncedAt.toISOString() : null,
    })),
    recentInvoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalEur: toNumber(invoice.totalEur),
      dueDate: invoice.dueDate.toISOString(),
      usageRecordCount: invoice._count.usageRecords,
    })),
  };
}

export const getProviderAnalytics = async (req: Request, res: Response) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const providerId = await resolveProviderId(req, parsed.data.providerId);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const period = parsePeriod(parsed.data.from, parsed.data.to);
    const report = await buildProviderReport(providerId, period.from, period.to);
    if (!report) return res.status(404).json({ error: "Provider not found" });
    return res.json({ report });
  } catch (error) {
    console.error("getProviderAnalytics error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load provider analytics" });
  }
};

export const getGlobalAnalytics = async (req: Request, res: Response) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const period = parsePeriod(parsed.data.from, parsed.data.to);
    const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
    const reports = (
      await Promise.all(providers.map((provider) => buildProviderReport(provider.id, period.from, period.to)))
    ).filter((report): report is NonNullable<typeof report> => Boolean(report));

    const exportJobs = await prisma.exportJob.count({
      where: { createdAt: { gte: period.from, lte: period.to } },
    });
    const dayBuckets = buildDayBuckets(period.from, period.to);
    for (const report of reports) {
      for (const day of report.usageByDay) {
        dayBuckets[day.date].sessions += day.sessions;
        dayBuckets[day.date].kWh += day.kWh;
        dayBuckets[day.date].revenueEur += day.revenueEur;
      }
    }

    const totals = reports.reduce(
      (acc, report) => {
        acc.chargers += report.totals.chargers;
        acc.activeChargers += report.totals.activeChargers;
        acc.sessions += report.totals.sessions;
        acc.energyKWh += report.totals.energyKWh;
        acc.revenueEur += report.totals.revenueEur;
        acc.openInvoiceTotalEur += report.totals.openInvoiceTotalEur;
        return acc;
      },
      {
        providers: providers.length,
        activeProviders: providers.filter((provider) => provider.status === "ACTIVE").length,
        chargers: 0,
        activeChargers: 0,
        sessions: 0,
        energyKWh: 0,
        revenueEur: 0,
        openInvoiceTotalEur: 0,
        exportJobs,
      },
    );

    return res.json({
      report: {
        period: { from: period.from.toISOString(), to: period.to.toISOString() },
        totals: {
          ...totals,
          energyKWh: Number(totals.energyKWh.toFixed(2)),
          revenueEur: Number(totals.revenueEur.toFixed(2)),
          openInvoiceTotalEur: Number(totals.openInvoiceTotalEur.toFixed(2)),
        },
        usageByDay: Object.values(dayBuckets).map((bucket) => ({
          ...bucket,
          kWh: Number(bucket.kWh.toFixed(2)),
          revenueEur: Number(bucket.revenueEur.toFixed(2)),
        })),
        providerBreakdown: reports.map((report) => ({
          providerId: report.provider.id,
          name: report.provider.name,
          status: report.provider.status,
          chargers: report.totals.chargers,
          sessions: report.totals.sessions,
          energyKWh: report.totals.energyKWh,
          revenueEur: report.totals.revenueEur,
          openInvoiceTotalEur: report.totals.openInvoiceTotalEur,
          lastSync: (() => {
            const syncs = report.apiConfigs
              .map((config) => config.lastSyncedAt)
              .filter((value): value is string => Boolean(value))
              .sort();
            return syncs.length > 0 ? syncs[syncs.length - 1] : null;
          })(),
        })),
        chargerMap: reports.flatMap((report) =>
          report.chargerMap.map((charger) => ({
            ...charger,
            providerId: report.provider.id,
            providerName: report.provider.name,
          })),
        ),
        serviceHealth: [
          { service: "ApiGateway", status: "OPERATIONAL" },
          { service: "AnalyticsService", status: "OPERATIONAL" },
          { service: "IntegrationService", status: "OPERATIONAL" },
          { service: "BillingService", status: "OPERATIONAL" },
        ],
      },
    });
  } catch (error) {
    console.error("getGlobalAnalytics error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load global analytics" });
  }
};

async function getUsageRows(providerId: number | null, from: Date, to: Date) {
  return prisma.providerUsageRecord.findMany({
    where: {
      ...(providerId ? { providerId } : {}),
      occurredAt: { gte: from, lte: to },
    },
    orderBy: [{ providerId: "asc" }, { occurredAt: "asc" }],
    include: { invoice: true },
  });
}

function csvEscape(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(header: string[], rows: unknown[][]) {
  return [header.join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function usageRowsToCsv(rows: Awaited<ReturnType<typeof getUsageRows>>) {
  const header = [
    "providerId",
    "invoiceNumber",
    "sourceType",
    "sourceId",
    "quantity",
    "amountEur",
    "occurredAt",
    "metadata",
  ];
  return makeCsv(
    header,
    rows.map((row) => [
        row.providerId,
        row.invoice?.invoiceNumber ?? "",
        row.sourceType,
        row.sourceId ?? "",
        row.quantity,
        toNumber(row.amountEur).toFixed(2),
        row.occurredAt.toISOString(),
        row.metadata ?? {},
    ]),
  );
}

function providerDailyToCsv(report: NonNullable<Awaited<ReturnType<typeof buildProviderReport>>>) {
  return makeCsv(
    ["providerId", "providerName", "date", "sessions", "energyKWh", "revenueEur"],
    report.usageByDay.map((day) => [
      report.provider.id,
      report.provider.name,
      day.date,
      day.sessions,
      day.kWh.toFixed(2),
      day.revenueEur.toFixed(2),
    ]),
  );
}

function providerChargersToCsv(report: NonNullable<Awaited<ReturnType<typeof buildProviderReport>>>) {
  return makeCsv(
    [
      "providerId",
      "providerName",
      "chargerId",
      "name",
      "address",
      "lat",
      "lng",
      "status",
      "connectorType",
      "maxKW",
      "sessions",
      "energyKWh",
      "revenueEur",
    ],
    report.chargerMap.map((charger) => [
      report.provider.id,
      report.provider.name,
      charger.chargerId,
      charger.name,
      charger.address ?? "",
      charger.lat,
      charger.lng,
      charger.status,
      charger.connectorType,
      charger.maxKW,
      charger.sessions,
      charger.kWh.toFixed(2),
      charger.revenueEur.toFixed(2),
    ]),
  );
}

function globalProvidersToCsv(reports: Array<NonNullable<Awaited<ReturnType<typeof buildProviderReport>>>>) {
  return makeCsv(
    [
      "providerId",
      "providerName",
      "status",
      "chargers",
      "activeChargers",
      "sessions",
      "energyKWh",
      "revenueEur",
      "openInvoiceTotalEur",
      "lastSync",
    ],
    reports.map((report) => {
      const syncs = report.apiConfigs
        .map((config) => config.lastSyncedAt)
        .filter((value): value is string => Boolean(value))
        .sort();
      const lastSync = syncs.length > 0 ? syncs[syncs.length - 1] : "";
      return [
        report.provider.id,
        report.provider.name,
        report.provider.status,
        report.totals.chargers,
        report.totals.activeChargers,
        report.totals.sessions,
        report.totals.energyKWh.toFixed(2),
        report.totals.revenueEur.toFixed(2),
        report.totals.openInvoiceTotalEur.toFixed(2),
        lastSync,
      ];
    }),
  );
}

function globalChargersToCsv(reports: Array<NonNullable<Awaited<ReturnType<typeof buildProviderReport>>>>) {
  return makeCsv(
    [
      "providerId",
      "providerName",
      "chargerId",
      "name",
      "address",
      "lat",
      "lng",
      "status",
      "connectorType",
      "maxKW",
      "sessions",
      "energyKWh",
      "revenueEur",
    ],
    reports.flatMap((report) =>
      report.chargerMap.map((charger) => [
        report.provider.id,
        report.provider.name,
        charger.chargerId,
        charger.name,
        charger.address ?? "",
        charger.lat,
        charger.lng,
        charger.status,
        charger.connectorType,
        charger.maxKW,
        charger.sessions,
        charger.kWh.toFixed(2),
        charger.revenueEur.toFixed(2),
      ]),
    ),
  );
}

async function buildExportCsv(args: {
  exportType: z.infer<typeof exportSchema>["exportType"];
  scope: "PROVIDER" | "GLOBAL";
  providerId: number | null;
  from: Date;
  to: Date;
}) {
  if (args.exportType === "USAGE_RECORDS") {
    const rows = await getUsageRows(args.providerId, args.from, args.to);
    return { csv: usageRowsToCsv(rows), rowCount: rows.length };
  }

  if (args.scope === "PROVIDER") {
    if (args.providerId === null) throw new Error("Provider export requires providerId");
    const report = await buildProviderReport(args.providerId, args.from, args.to);
    if (!report) throw new Error("Provider not found");
    if (args.exportType === "PROVIDER_DAILY") {
      return { csv: providerDailyToCsv(report), rowCount: report.usageByDay.length };
    }
    if (args.exportType === "PROVIDER_CHARGERS") {
      return { csv: providerChargersToCsv(report), rowCount: report.chargerMap.length };
    }
    throw new Error(`${args.exportType} is only available to PlatformOperator global exports`);
  }

  const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
  const reports = (
    await Promise.all(providers.map((provider) => buildProviderReport(provider.id, args.from, args.to)))
  ).filter((report): report is NonNullable<typeof report> => Boolean(report));

  if (args.exportType === "GLOBAL_PROVIDERS") {
    return { csv: globalProvidersToCsv(reports), rowCount: reports.length };
  }
  if (args.exportType === "GLOBAL_CHARGERS") {
    const rowCount = reports.reduce((sum, report) => sum + report.chargerMap.length, 0);
    return { csv: globalChargersToCsv(reports), rowCount };
  }

  throw new Error(`${args.exportType} is only available to provider exports`);
}

function exportFileSlug(exportType: string) {
  return exportType.toLowerCase().replace(/_/g, "-");
}

export const createUsageExport = async (req: Request, res: Response) => {
  const parsed = exportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const period = parsePeriod(parsed.data.from, parsed.data.to);
    const requestedScope = parsed.data.scope ?? "PROVIDER";
    const scope = req.userRole === "PLATFORM_OPERATOR" ? requestedScope : "PROVIDER";
    const providerId = scope === "GLOBAL" ? null : await resolveProviderId(req, parsed.data.providerId);

    if (scope === "PROVIDER" && providerId === null) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const job = await prisma.exportJob.create({
      data: {
        providerId,
        requestedById: req.userId,
        scope,
        format: parsed.data.format as ExportFormat,
        status: ExportStatus.PENDING,
        parameters: {
          from: period.from.toISOString(),
          to: period.to.toISOString(),
          providerId,
          exportType: parsed.data.exportType,
        },
      },
    });

    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: ExportStatus.PROCESSING },
    });

    const result = await buildExportCsv({
      exportType: parsed.data.exportType,
      scope,
      providerId,
      from: period.from,
      to: period.to,
    });
    const fileName = `${scope.toLowerCase()}-${exportFileSlug(parsed.data.exportType)}-${dayKey(period.from)}-${dayKey(period.to)}.${parsed.data.format.toLowerCase()}`;
    const completed = await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: ExportStatus.COMPLETED,
        fileName,
        downloadUrl: `/api/v1/analytics/exports/${job.id}/download`,
        resultJson: {
          rowCount: result.rowCount,
          exportType: parsed.data.exportType,
          csv: result.csv,
        } as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });

    return res.status(201).json({ exportJob: serializeExportJob(completed) });
  } catch (error) {
    console.error("createUsageExport error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create usage export" });
  }
};

export const listExportJobs = async (req: Request, res: Response) => {
  const parsed = exportListSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const providerId =
      req.userRole === "PLATFORM_OPERATOR" && parsed.data.scope === "GLOBAL"
        ? null
        : await resolveProviderId(req, parsed.data.providerId);

    const jobs = await prisma.exportJob.findMany({
      where: {
        ...(req.userRole === "PLATFORM_OPERATOR" && parsed.data.scope === "GLOBAL"
          ? { scope: "GLOBAL" }
          : { providerId }),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
    });

    return res.json({ exportJobs: jobs.map(serializeExportJob) });
  } catch (error) {
    console.error("listExportJobs error:", error);
    return res.status(500).json({ error: "Failed to load export jobs" });
  }
};

export const downloadExport = async (req: Request, res: Response) => {
  const parsed = exportIdSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: z.treeifyError(parsed.error) });

  try {
    const job = await prisma.exportJob.findUnique({ where: { id: parsed.data.id } });
    if (!job) return res.status(404).json({ error: "Export job not found" });

    if (req.userRole !== "PLATFORM_OPERATOR") {
      const providerId = await resolveProviderId(req);
      if (job.providerId !== providerId) {
        return res.status(403).json({ error: "Forbidden: export belongs to another provider" });
      }
    }

    if (job.status !== "COMPLETED" || !job.resultJson || typeof job.resultJson !== "object") {
      return res.status(409).json({ error: "Export is not ready yet" });
    }

    const csv = (job.resultJson as { csv?: unknown }).csv;
    if (typeof csv !== "string") {
      return res.status(404).json({ error: "Export payload not found" });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${job.fileName ?? "usage-export.csv"}"`);
    return res.send(csv);
  } catch (error) {
    console.error("downloadExport error:", error);
    return res.status(500).json({ error: "Failed to download export" });
  }
};
