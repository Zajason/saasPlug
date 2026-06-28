"use client";

import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  FileDown,
  FileText,
  Globe2,
  Loader2,
  MapPinned,
  Menu,
  PlugZap,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MenuPanel } from "../../components/MenuPanel";
import { StatsChargerMap } from "../../components/StatsChargerMap";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  fetchProviderApiConfigs,
  fetchProviderAnalytics,
  fetchExportJobs,
  fetchProviderSubscriptionBilling,
  fetchProviderProfile,
  fetchSyncedProviderChargers,
  confirmProviderPayment,
  createUsageExport,
  downloadExportJob,
  getAuthRole,
  payProviderInvoice,
  startProviderSubscription,
  syncProviderChargers,
  type ExportJob,
  type AnalyticsExportType,
  type IntegrationSyncSummary,
  type ProviderInvoiceDetail,
  type ProviderAnalyticsReport,
  type ProviderApiConfig,
  type ProviderProfile,
  type ProviderSubscriptionBilling,
  type SyncedProviderCharger,
} from "../../utils/api";

type ProviderCharger = {
  id: string;
  name: string;
  area: string;
  externalProvider: string;
  connector: string;
  powerKw: number;
  status: "available" | "in_use" | "outage";
  price: number;
  lastSyncedAt: string;
};

const statusStyles = {
  available: "border-blue-200 bg-blue-50 text-blue-700",
  in_use: "border-amber-200 bg-amber-50 text-amber-700",
  outage: "border-red-200 bg-red-50 text-red-700",
  paid: "border-blue-200 bg-blue-50 text-blue-700",
  open: "border-amber-200 bg-amber-50 text-amber-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  processing: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-gray-200 bg-gray-50 text-gray-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const providerExportOptions: Array<{
  type: AnalyticsExportType;
  label: string;
  detail: string;
}> = [
  {
    type: "USAGE_RECORDS",
    label: "Usage records CSV",
    detail: "Raw provider billing usage entries",
  },
  {
    type: "PROVIDER_DAILY",
    label: "Daily usage CSV",
    detail: "Sessions, kWh, and revenue grouped by day",
  },
  {
    type: "PROVIDER_CHARGERS",
    label: "Per-charger CSV",
    detail: "Usage and revenue per owned charger",
  },
];

function formatEuro(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function statusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "in_use") return "In Use";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function badgeStyle(status: string) {
  const normalized = status.toLowerCase() as keyof typeof statusStyles;
  return statusStyles[normalized] ?? "border-gray-200 bg-gray-50 text-gray-700";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatKWh(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} kWh`;
}

function legacyStatusLabel(status: ProviderCharger["status"]) {
  switch (status) {
    case "available":
      return "Available";
    case "in_use":
      return "In Use";
    case "outage":
      return "Outage";
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPeriod(start: string, end: string) {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function exportTypeFromJob(job: ExportJob): AnalyticsExportType {
  if (job.parameters && typeof job.parameters === "object" && "exportType" in job.parameters) {
    const exportType = (job.parameters as { exportType?: unknown }).exportType;
    if (
      exportType === "USAGE_RECORDS" ||
      exportType === "PROVIDER_DAILY" ||
      exportType === "PROVIDER_CHARGERS" ||
      exportType === "GLOBAL_PROVIDERS" ||
      exportType === "GLOBAL_CHARGERS"
    ) {
      return exportType;
    }
  }

  return "USAGE_RECORDS";
}

const stripePromise = (() => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return key ? loadStripe(key) : null;
})();

function normalizeStatus(status: string | undefined): ProviderCharger["status"] {
  if (status === "IN_USE") return "in_use";
  if (status === "OUTAGE") return "outage";
  return "available";
}

function mapSyncedCharger(item: SyncedProviderCharger): ProviderCharger | null {
  if (!item.charger) return null;
  return {
    id: `${item.externalProvider}:${item.externalId}`,
    name: item.charger.name,
    area: item.charger.address ?? `${item.charger.lat.toFixed(4)}, ${item.charger.lng.toFixed(4)}`,
    externalProvider: item.externalProvider,
    connector: item.charger.connectorType,
    powerKw: item.charger.maxKW,
    status: normalizeStatus(item.charger.status),
    price: Number(item.charger.kwhprice),
    lastSyncedAt: item.lastSyncedAt,
  };
}

export default function ProviderDashboard() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [configs, setConfigs] = useState<ProviderApiConfig[]>([]);
  const [chargers, setChargers] = useState<ProviderCharger[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<IntegrationSyncSummary[] | null>(null);
  const [analyticsReport, setAnalyticsReport] = useState<ProviderAnalyticsReport | null>(null);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [selectedExportType, setSelectedExportType] = useState<AnalyticsExportType>("USAGE_RECORDS");
  const [exportFrom, setExportFrom] = useState("2026-05-01");
  const [exportTo, setExportTo] = useState("2026-05-31");
  const [billing, setBilling] = useState<ProviderSubscriptionBilling | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<{
    clientSecret: string;
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    const role = getAuthRole();
    if (role === "PROVIDER_ADMIN") {
      setIsAllowed(true);
      return;
    }

    router.replace(role === "PLATFORM_OPERATOR" ? "/operator" : role === "EV_USER" ? "/" : "/signin");
  }, [router]);

  const loadIntegrationData = async () => {
    setErrorMessage(null);
    const [profileResponse, configsResponse, chargersResponse, analyticsResponse, exportsResponse, billingResponse] = await Promise.all([
      fetchProviderProfile(),
      fetchProviderApiConfigs(),
      fetchSyncedProviderChargers(),
      fetchProviderAnalytics({ from: exportFrom, to: exportTo }),
      fetchExportJobs("PROVIDER"),
      fetchProviderSubscriptionBilling(),
    ]);

    setProvider(profileResponse.provider);
    setConfigs(configsResponse.configs);
    setChargers(chargersResponse.chargers.map(mapSyncedCharger).filter((item): item is ProviderCharger => Boolean(item)));
    setAnalyticsReport(analyticsResponse.report);
    setExportJobs(exportsResponse.exportJobs);
    setBilling(billingResponse);
  };

  useEffect(() => {
    if (!isAllowed) return;

    let cancelled = false;
    setIsLoading(true);
    loadIntegrationData()
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load provider integration data.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAllowed, exportFrom, exportTo]);

  const handleSync = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    setLastSync(null);

    try {
      const result = await syncProviderChargers();
      setLastSync(result.synced);
      await loadIntegrationData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to sync provider chargers.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateExport = async (exportType: AnalyticsExportType = "USAGE_RECORDS") => {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const result = await createUsageExport({
        from: exportFrom,
        to: exportTo,
        scope: "PROVIDER",
        exportType,
        format: "CSV",
      });
      setExportJobs((current) => [result.exportJob, ...current.filter((job) => job.id !== result.exportJob.id)]);
      const refreshed = await fetchProviderAnalytics({ from: exportFrom, to: exportTo });
      setAnalyticsReport(refreshed.report);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create usage export.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadExport = async (job: ExportJob) => {
    setDownloadingExportId(job.id);
    setErrorMessage(null);

    try {
      await downloadExportJob(job);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to download usage export.");
    } finally {
      setDownloadingExportId(null);
    }
  };

  const refreshBilling = async () => {
    const [billingResponse, analyticsResponse] = await Promise.all([
      fetchProviderSubscriptionBilling(),
      fetchProviderAnalytics({ from: exportFrom, to: exportTo }),
    ]);
    setBilling(billingResponse);
    setAnalyticsReport(analyticsResponse.report);
  };

  const handleStartSubscription = async (planCode: string) => {
    setBillingLoading(true);
    setBillingMessage(null);
    setErrorMessage(null);

    try {
      const result = await startProviderSubscription(planCode);
      if (result.clientSecret) {
        setPaymentDialog({
          clientSecret: result.clientSecret,
          title: `Pay ${result.subscription.plan?.name ?? "subscription"}`,
          description: `${formatEuro(result.invoice.totalEur)} for ${result.invoice.invoiceNumber}`,
        });
        if (billing) {
          setBilling({ ...billing, subscription: result.subscription });
        }
      } else {
        await refreshBilling();
        setBillingMessage(result.mock ? "Subscription activated in mock mode." : "Subscription activated.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start provider subscription.");
    } finally {
      setBillingLoading(false);
    }
  };

  const handlePayProviderInvoice = async (invoice: ProviderInvoiceDetail) => {
    setBillingLoading(true);
    setBillingMessage(null);
    setErrorMessage(null);

    try {
      const result = await payProviderInvoice(invoice.id);
      if (result.clientSecret) {
        setPaymentDialog({
          clientSecret: result.clientSecret,
          title: `Pay ${invoice.invoiceNumber}`,
          description: `${formatEuro(invoice.totalEur)} due ${formatDate(invoice.dueDate)}`,
        });
      } else {
        await refreshBilling();
        setBillingMessage(result.mock ? "Invoice paid in mock mode." : "Invoice paid.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to pay provider invoice.");
    } finally {
      setBillingLoading(false);
    }
  };

  const handleStripePaymentConfirmed = async (paymentIntentId: string) => {
    await confirmProviderPayment(paymentIntentId);
    setPaymentDialog(null);
    setBillingMessage("Stripe payment confirmed and invoice marked as paid.");
    await refreshBilling();
  };

  const totals = useMemo(() => {
    const online = chargers.filter((charger) => charger.status !== "outage").length;
    const inUse = chargers.filter((charger) => charger.status === "in_use").length;
    const avgPrice =
      chargers.length > 0
        ? chargers.reduce((sum, charger) => sum + charger.price, 0) / chargers.length
        : 0;
    const capacity = chargers.reduce((sum, charger) => sum + charger.powerKw, 0);
    return { online, inUse, avgPrice, capacity };
  }, [chargers]);

  const selectedExportOption = providerExportOptions.find((option) => option.type === selectedExportType) ?? providerExportOptions[0];
  const visibleExportJobs = useMemo(
    () => exportJobs.filter((job) => exportTypeFromJob(job) === selectedExportType),
    [exportJobs, selectedExportType],
  );

  if (!isAllowed) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMenuOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-gray-700" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-medium text-gray-950 sm:text-lg">Provider Console</h1>
            <p className="hidden text-xs text-gray-500 sm:block">{provider?.name ?? "Provider workspace"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex">
            <ShieldCheck className="h-3 w-3" />
            Active subscription
          </Badge>
          <Button variant="outline" size="sm">
            <Settings2 className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <MenuPanel isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-medium text-gray-950">Provider operations</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your saasPlug account, charger integration, analytics, invoices, and usage exports.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {lastSync ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Synced {lastSync.reduce((sum, item) => sum + item.total, 0)} chargers from{" "}
            {lastSync.map((item) => item.externalProvider).join(", ")}.
          </div>
        ) : null}

        {billingMessage ? (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {billingMessage}
          </div>
        ) : null}

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard icon={PlugZap} label="Chargers" value={`${chargers.length}`} detail={`${totals.online} online`} />
          <MetricCard icon={Activity} label="Sessions" value={`${analyticsReport?.totals.sessions ?? totals.inUse}`} detail="Usage records in period" />
          <MetricCard icon={Zap} label="Energy" value={formatKWh(analyticsReport?.totals.energyKWh ?? totals.capacity)} detail="Delivered or estimated" />
          <MetricCard icon={CreditCard} label="Revenue" value={formatEuro(analyticsReport?.totals.revenueEur ?? totals.avgPrice)} detail="Provider usage value" />
        </section>

        <Tabs defaultValue="account" className="gap-4">
          <div className="overflow-x-auto">
            <TabsList className="w-max rounded-lg bg-gray-100">
              <TabsTrigger value="account">Account & API</TabsTrigger>
              <TabsTrigger value="chargers">Chargers</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="billing">Subscription</TabsTrigger>
              <TabsTrigger value="exports">Exports</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="account">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Panel title="Provider profile" icon={Building2}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Legal name" value={provider?.legalName ?? provider?.name ?? "Loading"} />
                  <Field label="Billing email" value={provider?.contactEmail ?? "Loading"} />
                  <Field label="Country" value={provider?.country ?? "Not set"} />
                  <Field label="Support phone" value={provider?.contactPhone ?? "Not set"} />
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm">
                    <CheckCircle2 className="h-4 w-4" />
                    {provider?.status ?? "ACTIVE"}
                  </Button>
                  <Button variant="outline" size="sm">View subscription</Button>
                </div>
              </Panel>

              <Panel title="ExternalProviderAPI configuration" icon={Globe2}>
                {isLoading ? (
                  <p className="text-sm text-gray-500">Loading provider API configuration...</p>
                ) : (
                  <div className="space-y-3">
                    {configs.map((config) => (
                      <div key={config.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{config.externalProvider}</p>
                            <p className="mt-1 break-all text-xs text-gray-500">{config.baseUrl}</p>
                          </div>
                          <Badge variant="outline" className={config.enabled ? "border-blue-200 bg-blue-50 text-blue-700" : ""}>
                            {config.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-500 sm:grid-cols-2">
                          <span>Key: {config.apiKey}</span>
                          <span>Last sync: {formatDateTime(config.lastSyncedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleSync} disabled={isSyncing || isLoading}>
                    <RefreshCw className="h-4 w-4" />
                    {isSyncing ? "Syncing..." : "Sync now"}
                  </Button>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="chargers">
            <Panel title="Owned chargers" icon={PlugZap}>
              <TableViewport minWidth="760px" maxHeight="62vh">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Charger</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Connector</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Last sync</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-gray-500">
                          Loading synced chargers...
                        </TableCell>
                      </TableRow>
                    ) : chargers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-gray-500">
                          No synced chargers yet. Use Sync now from Account & API.
                        </TableCell>
                      </TableRow>
                    ) : (
                      chargers.map((charger) => (
                        <TableRow key={charger.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-gray-900">{charger.name}</p>
                              <p className="text-xs text-gray-500">{charger.id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">{charger.area}</TableCell>
                          <TableCell>{charger.externalProvider}</TableCell>
                          <TableCell>{charger.connector} · {charger.powerKw} kW</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusStyles[charger.status]}>
                              {legacyStatusLabel(charger.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatEuro(charger.price)}</TableCell>
                          <TableCell>{formatDateTime(charger.lastSyncedAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableViewport>
            </Panel>
          </TabsContent>

          <TabsContent value="map">
            <Panel title="Owned charger map" icon={MapPinned}>
              <StatsChargerMap
                chargers={analyticsReport?.chargerMap ?? []}
                emptyText="No owned chargers are available for map statistics yet. Sync provider chargers first."
              />
            </Panel>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Provider analytics" icon={BarChart3}>
                <ScrollBox maxHeight="52vh">
                  <div className="space-y-3">
                  {(analyticsReport?.usageByDay ?? []).map((item) => {
                    const maxSessions = Math.max(1, ...(analyticsReport?.usageByDay ?? []).map((day) => day.sessions));
                    return (
                    <div key={item.date} className="grid grid-cols-[44px_1fr_52px] items-center gap-3">
                      <span className="text-sm text-gray-500">{item.label}</span>
                      <div className="h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${Math.max(4, (item.sessions / maxSessions) * 100)}%` }}
                        />
                      </div>
                      <span className="text-right text-sm font-medium text-gray-900">{item.sessions}</span>
                    </div>
                    );
                  })}
                  </div>
                </ScrollBox>
              </Panel>

              <Panel title="Usage summary" icon={Activity}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MiniStat label="Utilization" value={`${analyticsReport?.totals.utilizationRate ?? 0}%`} />
                  <MiniStat label="Avg. session" value={`${analyticsReport?.totals.avgSessionMinutes ?? 0} min`} />
                  <MiniStat label="Usage records" value={formatNumber(analyticsReport?.totals.usageRecords ?? 0)} />
                </div>
                <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-900">Top performing charger</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {analyticsReport?.chargerBreakdown[0]
                      ? `${analyticsReport.chargerBreakdown[0].name} recorded ${analyticsReport.chargerBreakdown[0].sessions} sessions and ${formatKWh(analyticsReport.chargerBreakdown[0].kWh)}.`
                      : "No charging-session activity has been recorded for the selected period yet."}
                  </p>
                </div>
                <ScrollBox className="mt-5" maxHeight="36vh">
                  <div className="space-y-3">
                    {(analyticsReport?.chargerBreakdown ?? []).map((charger) => (
                      <div key={charger.chargerId} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">{charger.name}</p>
                            <p className="text-xs text-gray-500">Charger #{charger.chargerId}</p>
                          </div>
                          <Badge variant="outline">{charger.sessions} sessions</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-3">
                          <span>{formatKWh(charger.kWh)}</span>
                          <span>{formatEuro(charger.revenueEur)}</span>
                          <span>{charger.status} · {charger.maxKW} kW</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollBox>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="billing">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Subscription plan" icon={CreditCard}>
                {billing?.subscription ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-blue-950">
                          {billing.subscription.plan?.name ?? "Provider plan"}
                        </p>
                        <p className="mt-1 text-sm text-blue-900">
                          {formatEuro(billing.subscription.plan?.monthlyFeeEur ?? 0)} / month ·{" "}
                          {formatEuro(billing.subscription.plan?.perSessionFeeEur ?? 0)} per session
                        </p>
                        <p className="mt-1 text-xs text-blue-800">
                          Current period:{" "}
                          {billing.subscription.currentPeriodStart && billing.subscription.currentPeriodEnd
                            ? formatPeriod(billing.subscription.currentPeriodStart, billing.subscription.currentPeriodEnd)
                            : "Managed locally until the next Stripe renewal"}
                        </p>
                      </div>
                      <Badge variant="outline" className={badgeStyle(billing.subscription.status)}>
                        {statusLabel(billing.subscription.status)}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Choose a plan to activate provider SaaS billing.</p>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3">
                  {(billing?.plans ?? []).map((plan) => {
                    const isCurrent = billing?.subscription?.planId === plan.id;
                    return (
                      <div key={plan.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-950">{plan.name}</p>
                            <p className="mt-1 text-sm text-gray-600">
                              {formatEuro(plan.monthlyFeeEur)} / month · {formatEuro(plan.perSessionFeeEur)} per session
                            </p>
                            <p className="mt-2 text-xs text-gray-500">
                              Includes analytics, export jobs, provider API sync, and operator billing visibility.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={isCurrent ? "outline" : "default"}
                            disabled={billingLoading || isCurrent}
                            onClick={() => handleStartSubscription(plan.code)}
                          >
                            {billingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? "Current" : "Select"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Provider SaaS invoices" icon={FileText}>
                <TableViewport minWidth="760px" maxHeight="56vh">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Billing period</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(billing?.invoices ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-sm text-gray-500">
                            No provider invoices yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (billing?.invoices ?? []).map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium text-gray-900">{invoice.invoiceNumber}</TableCell>
                            <TableCell>{formatPeriod(invoice.periodStart, invoice.periodEnd)}</TableCell>
                            <TableCell>{invoice.usageRecordCount}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={badgeStyle(invoice.status)}>
                                {statusLabel(invoice.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatEuro(invoice.totalEur)}</TableCell>
                            <TableCell className="text-right">
                              {invoice.status === "OPEN" || invoice.status === "OVERDUE" ? (
                                <Button size="sm" disabled={billingLoading} onClick={() => handlePayProviderInvoice(invoice)}>
                                  {billingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                  Pay
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" disabled>
                                  <Download className="h-4 w-4" />
                                  Paid
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableViewport>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="exports">
            <Panel title="Usage data export" icon={FileDown}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="from">From</Label>
                  <Input
                    id="from"
                    type="date"
                    value={exportFrom}
                    onChange={(event) => setExportFrom(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="to">To</Label>
                  <Input
                    id="to"
                    type="date"
                    value={exportTo}
                    onChange={(event) => setExportTo(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="format">Format</Label>
                  <Input id="format" defaultValue="CSV" className="mt-1" />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => handleCreateExport(selectedExportType)} disabled={isExporting}>
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    New export
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {providerExportOptions.map((option) => {
                  const isSelected = option.type === selectedExportType;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setSelectedExportType(option.type)}
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className={isSelected ? "mt-1 block text-xs text-gray-200" : "mt-1 block text-xs text-gray-500"}>
                        {option.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isExporting ? <p className="mt-2 text-sm text-gray-500">Creating {selectedExportOption.label.toLowerCase()}...</p> : null}
              <div className="mt-5 rounded-lg border border-gray-200">
                {visibleExportJobs.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No {selectedExportOption.label.toLowerCase()} jobs yet. Use New export to generate one.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      {visibleExportJobs.map((job) => (
                        <div key={job.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-200 px-4 py-3 text-sm last:border-b-0">
                          <span className="font-medium text-gray-900">{job.fileName ?? `Export job #${job.id}`}</span>
                          <Badge variant="outline" className={badgeStyle(job.status)}>{statusLabel(job.status)}</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadExport(job)}
                            disabled={job.status !== "COMPLETED" || downloadingExportId === job.id}
                          >
                            {downloadingExportId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={Boolean(paymentDialog)} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{paymentDialog?.title ?? "Pay provider invoice"}</DialogTitle>
            <DialogDescription>{paymentDialog?.description ?? "Confirm the card payment with Stripe."}</DialogDescription>
          </DialogHeader>
          {paymentDialog && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret: paymentDialog.clientSecret }}>
              <ProviderStripePaymentForm
                clientSecret={paymentDialog.clientSecret}
                onConfirmed={handleStripePaymentConfirmed}
                onError={(message) => setErrorMessage(message)}
              />
            </Elements>
          ) : (
            <p className="text-sm text-red-700">Stripe publishable key is not configured.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="mt-2 text-2xl font-medium text-gray-950">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <Icon className="h-5 w-5 text-gray-500" />
        <h3 className="text-base font-medium text-gray-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function TableViewport({
  children,
  minWidth,
  maxHeight,
}: {
  children: ReactNode;
  minWidth: string;
  maxHeight?: string;
}) {
  return (
    <div className="-mx-5 overflow-auto px-5" style={{ maxHeight }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

function ScrollBox({
  children,
  className,
  maxHeight,
}: {
  children: ReactNode;
  className?: string;
  maxHeight: string;
}) {
  return (
    <div className={className ? `${className} overflow-y-auto pr-2` : "overflow-y-auto pr-2"} style={{ maxHeight }}>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} readOnly className="mt-1 bg-gray-50" />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-medium text-gray-950">{value}</p>
    </div>
  );
}

function ProviderStripePaymentForm({
  clientSecret,
  onConfirmed,
  onError,
}: {
  clientSecret: string;
  onConfirmed: (paymentIntentId: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholder, setCardholder] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!stripe || !elements) {
      setLocalError("Stripe is not ready yet.");
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setLocalError("Card element is not available.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card,
          billing_details: cardholder ? { name: cardholder } : undefined,
        },
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Stripe payment failed.");
      }

      if (!result.paymentIntent?.id) {
        throw new Error("Stripe did not return a payment intent.");
      }

      await onConfirmed(result.paymentIntent.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not confirm provider payment.";
      setLocalError(message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider-cardholder">Cardholder Name</Label>
        <Input
          id="provider-cardholder"
          value={cardholder}
          onChange={(event) => setCardholder(event.target.value)}
          placeholder="Provider billing contact"
        />
      </div>
      <div className="space-y-2">
        <Label>Card Details</Label>
        <div className="rounded-md border bg-gray-50 px-3 py-2">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#111827",
                  "::placeholder": { color: "#9CA3AF" },
                },
                invalid: { color: "#dc2626" },
              },
            }}
          />
        </div>
      </div>
      {localError ? <p className="text-sm text-red-700">{localError}</p> : null}
      <DialogFooter>
        <Button type="submit" disabled={submitting || !stripe}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Confirm payment
        </Button>
      </DialogFooter>
    </form>
  );
}
