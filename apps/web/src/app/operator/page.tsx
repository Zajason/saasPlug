"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  FileDown,
  Gauge,
  Globe2,
  Loader2,
  MapPinned,
  Menu,
  PlugZap,
  ServerCog,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MenuPanel } from "../../components/MenuPanel";
import { StatsChargerMap } from "../../components/StatsChargerMap";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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
  createUsageExport,
  downloadExportJob,
  fetchExportJobs,
  fetchGlobalAnalytics,
  fetchProviderInvoices,
  getAuthRole,
  type AnalyticsExportType,
  type ExportJob,
  type GlobalAnalyticsReport,
  type ProviderInvoice,
} from "../../utils/api";

const statusStyles = {
  active: "border-blue-200 bg-blue-50 text-blue-700",
  sync_warning: "border-amber-200 bg-amber-50 text-amber-700",
  suspended: "border-red-200 bg-red-50 text-red-700",
  operational: "border-blue-200 bg-blue-50 text-blue-700",
  open: "border-red-200 bg-red-50 text-red-700",
  monitoring: "border-amber-200 bg-amber-50 text-amber-700",
  resolved: "border-blue-200 bg-blue-50 text-blue-700",
  low: "border-gray-200 bg-gray-50 text-gray-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-200 bg-red-50 text-red-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  processing: "border-amber-200 bg-amber-50 text-amber-700",
  pending: "border-gray-200 bg-gray-50 text-gray-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const operatorExportOptions: Array<{
  type: AnalyticsExportType;
  label: string;
  detail: string;
}> = [
  {
    type: "USAGE_RECORDS",
    label: "Usage records CSV",
    detail: "Raw provider usage entries across the platform",
  },
  {
    type: "GLOBAL_PROVIDERS",
    label: "Providers CSV",
    detail: "Provider usage, revenue, and sync status",
  },
  {
    type: "GLOBAL_CHARGERS",
    label: "Charger network CSV",
    detail: "All charger statistics across providers",
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
  if (normalized === "sync_warning") return "Sync warning";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function badgeStyle(status: string) {
  const normalized = status.toLowerCase() as keyof typeof statusStyles;
  return statusStyles[normalized] ?? "border-gray-200 bg-gray-50 text-gray-700";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatKWh(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} kWh`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

export default function OperatorConsole() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [report, setReport] = useState<GlobalAnalyticsReport | null>(null);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [providerInvoices, setProviderInvoices] = useState<ProviderInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedExportType, setSelectedExportType] = useState<AnalyticsExportType>("USAGE_RECORDS");
  const [exportFrom, setExportFrom] = useState("2026-05-01");
  const [exportTo, setExportTo] = useState("2026-05-31");

  useEffect(() => {
    const role = getAuthRole();
    if (role === "PLATFORM_OPERATOR") {
      setIsAllowed(true);
      return;
    }

    router.replace(role === "PROVIDER_ADMIN" ? "/provider" : role === "EV_USER" ? "/" : "/signin");
  }, [router]);

  useEffect(() => {
    if (!isAllowed) return;

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([
      fetchGlobalAnalytics({ from: exportFrom, to: exportTo }),
      fetchExportJobs("GLOBAL"),
      fetchProviderInvoices({ limit: 100 }),
    ])
      .then(([analyticsResponse, exportsResponse, invoicesResponse]) => {
        if (cancelled) return;
        setReport(analyticsResponse.report);
        setExportJobs(exportsResponse.exportJobs);
        setProviderInvoices(invoicesResponse.invoices);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load global analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAllowed, exportFrom, exportTo]);

  const handleCreateExport = async (exportType: AnalyticsExportType = "USAGE_RECORDS") => {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const result = await createUsageExport({
        from: exportFrom,
        to: exportTo,
        scope: "GLOBAL",
        exportType,
        format: "CSV",
      });
      setExportJobs((current) => [result.exportJob, ...current.filter((job) => job.id !== result.exportJob.id)]);
      const refreshed = await fetchGlobalAnalytics({ from: exportFrom, to: exportTo });
      setReport(refreshed.report);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create global export.");
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to download global export.");
    } finally {
      setDownloadingExportId(null);
    }
  };

  const totals = useMemo(() => {
    return {
      chargers: report?.totals.chargers ?? 0,
      sessions: report?.totals.sessions ?? 0,
      revenue: report?.totals.revenueEur ?? 0,
      activeProviders: report?.totals.activeProviders ?? 0,
      providers: report?.totals.providers ?? 0,
      energyKWh: report?.totals.energyKWh ?? 0,
      exportJobs: report?.totals.exportJobs ?? exportJobs.length,
    };
  }, [exportJobs.length, report]);

  const selectedExportOption = operatorExportOptions.find((option) => option.type === selectedExportType) ?? operatorExportOptions[0];
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
            <Globe2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-medium text-gray-950 sm:text-lg">Operator Console</h1>
            <p className="hidden text-xs text-gray-500 sm:block">saasPlug platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex">
            <CheckCircle2 className="h-3 w-3" />
            Platform healthy
          </Badge>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Report
          </Button>
        </div>
      </div>

      <MenuPanel isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-medium text-gray-950">Global analytics</h2>
          <p className="mt-1 text-sm text-gray-500">
            View cross-provider usage, SaaS revenue, provider health, exports, and platform operations.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard icon={Building2} label="Providers" value={`${totals.activeProviders}/${totals.providers}`} detail="Active providers" />
          <MetricCard icon={PlugZap} label="Chargers" value={`${totals.chargers}`} detail="Connected to saasPlug" />
          <MetricCard icon={Activity} label="Sessions" value={`${totals.sessions}`} detail="Last 30 days" />
          <MetricCard icon={CreditCard} label="SaaS revenue" value={formatEuro(totals.revenue)} detail={formatKWh(totals.energyKWh)} />
        </section>

        <Tabs defaultValue="overview" className="gap-4">
          <div className="overflow-x-auto">
            <TabsList className="w-max rounded-lg bg-gray-100">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="providers">Providers</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="operations">Operations</TabsTrigger>
              <TabsTrigger value="exports">Exports</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Network usage" icon={BarChart3}>
                <ScrollBox maxHeight="52vh">
                  <div className="space-y-3">
                  {(report?.usageByDay ?? []).map((item) => {
                    const maxSessions = Math.max(1, ...(report?.usageByDay ?? []).map((day) => day.sessions));
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

              <Panel title="Global report summary" icon={Gauge}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MiniStat label="Active chargers" value={formatNumber(report?.totals.activeChargers ?? 0)} />
                  <MiniStat label="Energy delivered" value={formatKWh(report?.totals.energyKWh ?? 0)} />
                  <MiniStat label="Export jobs" value={formatNumber(totals.exportJobs)} />
                </div>
                <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-900">PlatformOperator view</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {report?.providerBreakdown[0]
                      ? `${report.providerBreakdown[0].name} is currently the highest-usage provider with ${report.providerBreakdown[0].sessions} sessions.`
                      : isLoading
                        ? "Loading global analytics..."
                        : "No provider usage has been recorded in the selected period yet."}
                  </p>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="providers">
            <Panel title="Provider health and revenue" icon={Users}>
              <TableViewport minWidth="760px" maxHeight="62vh">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Chargers</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead>Last sync</TableHead>
                      <TableHead className="text-right">SaaS revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report?.providerBreakdown ?? []).map((provider) => (
                      <TableRow key={provider.providerId}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">{provider.name}</p>
                            <p className="text-xs text-gray-500">PRV-{provider.providerId}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeStyle(provider.status)}>
                            {statusLabel(provider.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{provider.chargers}</TableCell>
                        <TableCell className="text-right">{provider.sessions}</TableCell>
                        <TableCell>{formatDateTime(provider.lastSync)}</TableCell>
                        <TableCell className="text-right">{formatEuro(provider.revenueEur)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableViewport>
            </Panel>
          </TabsContent>

          <TabsContent value="billing">
            <Panel title="Provider subscription payments" icon={CreditCard}>
              <TableViewport minWidth="900px" maxHeight="62vh">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-gray-500">
                          No provider invoices have been issued yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      providerInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-gray-900">{invoice.providerName ?? `Provider ${invoice.providerId}`}</p>
                              <p className="text-xs text-gray-500">PRV-{invoice.providerId}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-gray-900">{invoice.invoiceNumber}</TableCell>
                          <TableCell>{formatDateTime(invoice.periodStart)} - {formatDateTime(invoice.periodEnd)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={badgeStyle(invoice.status)}>
                              {statusLabel(invoice.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{invoice.paidAt ? formatDateTime(invoice.paidAt) : "Not paid"}</TableCell>
                          <TableCell className="text-right">{formatEuro(invoice.totalEur)}</TableCell>
                          <TableCell className="text-right">{invoice.paymentCount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableViewport>
            </Panel>
          </TabsContent>

          <TabsContent value="map">
            <Panel title="All charger statistics map" icon={MapPinned}>
              <StatsChargerMap
                chargers={report?.chargerMap ?? []}
                emptyText="No charger statistics are available yet. Sync providers or seed demo data first."
              />
            </Panel>
          </TabsContent>

          <TabsContent value="operations">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
              <Panel title="Service status" icon={ServerCog}>
                <ScrollBox maxHeight="52vh">
                  <div className="space-y-3">
                    {(report?.serviceHealth ?? []).map((service) => (
                      <div key={service.service} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium text-gray-900">{service.service}</span>
                        </div>
                        <Badge variant="outline" className={badgeStyle(service.status)}>{statusLabel(service.status)}</Badge>
                      </div>
                    ))}
                  </div>
                </ScrollBox>
              </Panel>

              <Panel title="Platform totals" icon={Gauge}>
                <div className="space-y-3">
                  <MiniStat label="Open provider invoices" value={formatEuro(report?.totals.openInvoiceTotalEur ?? 0)} />
                  <MiniStat label="Usage sessions" value={formatNumber(report?.totals.sessions ?? 0)} />
                  <MiniStat label="Provider export jobs" value={formatNumber(report?.totals.exportJobs ?? 0)} />
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="exports">
            <Panel title="Global analytics export" icon={FileDown}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <Label htmlFor="operator-from">From</Label>
                  <Input
                    id="operator-from"
                    type="date"
                    value={exportFrom}
                    onChange={(event) => setExportFrom(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="operator-to">To</Label>
                  <Input
                    id="operator-to"
                    type="date"
                    value={exportTo}
                    onChange={(event) => setExportTo(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="operator-scope">Scope</Label>
                  <Input id="operator-scope" defaultValue="All providers" className="mt-1" />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => handleCreateExport(selectedExportType)} disabled={isExporting}>
                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    New export
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {operatorExportOptions.map((option) => {
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
                        <ExportRow
                          key={job.id}
                          name={job.fileName ?? `Global export job #${job.id}`}
                          status={statusLabel(job.status)}
                          className={badgeStyle(job.status)}
                          isDownloading={downloadingExportId === job.id}
                          onDownload={() => handleDownloadExport(job)}
                          disabled={job.status !== "COMPLETED" || downloadingExportId === job.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </main>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-medium text-gray-950">{value}</p>
    </div>
  );
}

function ExportRow({
  name,
  status,
  className,
  isDownloading,
  onDownload,
  disabled,
}: {
  name: string;
  status: string;
  className?: string;
  isDownloading?: boolean;
  onDownload: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-gray-200 px-4 py-3 text-sm last:border-b-0">
      <span className="font-medium text-gray-900">{name}</span>
      <Badge variant="outline" className={className}>{status}</Badge>
      <Button variant="outline" size="sm" onClick={onDownload} disabled={disabled}>
        {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download
      </Button>
    </div>
  );
}
