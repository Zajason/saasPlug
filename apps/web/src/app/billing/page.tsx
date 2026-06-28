"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { CreditCard, FileText, Loader2, MapPin, Menu, Plus, Trash2, Zap } from 'lucide-react';

import { MenuPanel } from '../../components/MenuPanel';
import { SideMenu } from '../../components/SideMenu';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  AuthError,
  createPaymentSetupIntent,
  deletePaymentMethod,
  fetchBillingHistory,
  fetchPaymentMethods,
  savePaymentMethodToken,
  runMockCharge,
} from '../../utils/api';

type PaymentMethod = {
  id: number;
  provider: string;
  tokenLast4: string;
  status: string;
  createdAt: string;
};

type PaymentStatus = 'PREAUTHORIZED' | 'CAPTURED' | 'CANCELLED' | 'FAILED';

type BillingHistoryEntry = {
  id: number;
  sessionId: number;
  status: PaymentStatus;
  amountEur: number;
  providerRef: string | null;
  createdAt: string;
  session: {
    startedAt: string;
    endedAt: string | null;
    energyKWh: number;
    costEur: number | null;
    chargerName: string | null;
    chargerAddress: string | null;
    invoice: {
      id: number;
      pdfUrl: string;
      totalEur: number;
      createdAt: string;
    } | null;
  } | null;
};

const statusVariant: Record<PaymentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  CAPTURED: 'default',
  PREAUTHORIZED: 'secondary',
  CANCELLED: 'outline',
  FAILED: 'destructive',
};

const stripePromise = (() => {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return pk ? loadStripe(pk) : null;
})();

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

function formatAmount(amount: number | null | undefined) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `EUR ${amount.toFixed(2)}`;
}

export default function BillingScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [history, setHistory] = useState<BillingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const demoEnabled = process.env.NEXT_PUBLIC_ENABLE_MOCK_SESSION === '1';
  const [mockChargerId, setMockChargerId] = useState('1');
  const [mockAmount, setMockAmount] = useState('3.75');
  const [mockEnergy, setMockEnergy] = useState('12.34');
  const [mockLoading, setMockLoading] = useState(false);
  const [mockMessage, setMockMessage] = useState<string | null>(null);
  const [spendingView, setSpendingView] = useState<'monthly' | 'yearly' | 'stats' | null>(null);
  const [statsFrom, setStatsFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [statsTo, setStatsTo] = useState(() => new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [methods, historyResponse] = await Promise.all([
        fetchPaymentMethods(),
        fetchBillingHistory(),
      ]);

      setPaymentMethods(methods as PaymentMethod[]);
      setHistory((historyResponse as { history?: BillingHistoryEntry[] }).history ?? []);
    } catch (err: any) {
      if (err instanceof AuthError) {
        setError('Please sign in to view your billing history.');
      } else {
        setError(err?.message ?? 'Unable to load billing history.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const monthlySummary = useMemo(() => {
    const now = new Date();
    const captured = history.filter((e) => e.status === 'CAPTURED');

    // Build map of totals keyed by "YYYY-MM"
    const totals = new Map<string, number>();
    for (const entry of captured) {
      const d = new Date(entry.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      totals.set(key, (totals.get(key) ?? 0) + (entry.amountEur ?? 0));
    }

    // Last 6 calendar months (including current)
    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      months.push({ key, label, total: totals.get(key) ?? 0 });
    }
    return months;
  }, [history]);

  const yearlySummary = useMemo(() => {
    const captured = history.filter((e) => e.status === 'CAPTURED');
    const totals = new Map<number, number>();
    for (const entry of captured) {
      const year = new Date(entry.createdAt).getFullYear();
      totals.set(year, (totals.get(year) ?? 0) + (entry.amountEur ?? 0));
    }
    return Array.from(totals.entries())
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => b.year - a.year);
  }, [history]);

  const grandTotal = useMemo(() => {
    return history
      .filter((e) => e.status === 'CAPTURED')
      .reduce((sum, e) => sum + (e.amountEur ?? 0), 0);
  }, [history]);

  const periodStats = useMemo(() => {
    const from = new Date(statsFrom + 'T00:00:00');
    const to = new Date(statsTo + 'T23:59:59');
    const filtered = history.filter((e) => {
      if (e.status !== 'CAPTURED') return false;
      const d = new Date(e.createdAt);
      return d >= from && d <= to;
    });

    const totalSpent = filtered.reduce((s, e) => s + (e.amountEur ?? 0), 0);
    const totalKWh = filtered.reduce((s, e) => s + (e.session?.energyKWh ?? 0), 0);
    const sessionCount = filtered.length;
    const avgCost = sessionCount > 0 ? totalSpent / sessionCount : 0;
    const avgKWh = sessionCount > 0 ? totalKWh / sessionCount : 0;

    // Most used charger
    const chargerCounts = new Map<string, { name: string; count: number }>();
    for (const e of filtered) {
      const name = e.session?.chargerName ?? `Session #${e.sessionId}`;
      const entry = chargerCounts.get(name) ?? { name, count: 0 };
      entry.count++;
      chargerCounts.set(name, entry);
    }
    let topCharger: { name: string; count: number } | null = null;
    for (const c of chargerCounts.values()) {
      if (!topCharger || c.count > topCharger.count) topCharger = c;
    }

    return { totalSpent, totalKWh, sessionCount, avgCost, avgKWh, topCharger };
  }, [history, statsFrom, statsTo]);

  const triggerMockCharge = useCallback(async () => {
    if (!demoEnabled) return;

    setMockLoading(true);
    setMockMessage(null);
    setError(null);

    const parsedChargerId = Number(mockChargerId);
    const parsedAmount = Number(mockAmount);
    const parsedEnergy = Number(mockEnergy);

    try {
      const response = await runMockCharge({
        chargerId: Number.isFinite(parsedChargerId) ? parsedChargerId : undefined,
        amountEur: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
        kWh: Number.isFinite(parsedEnergy) ? parsedEnergy : undefined,
      });

      const sessionId = (response as { sessionId?: number }).sessionId;
      const paymentStatus = (response as { paymentStatus?: string }).paymentStatus ?? 'created';
      const amount = (response as { amountEur?: number }).amountEur ?? (Number.isFinite(parsedAmount) ? parsedAmount : undefined);
      const amountText = amount !== undefined && !Number.isNaN(amount) ? amount.toFixed(2) : 'n/a';

      setMockMessage(`Session ${sessionId ?? 'new'} • status ${paymentStatus} • EUR ${amountText}`);
      await loadData();
    } catch (err: any) {
      setError(err?.message ?? 'Mock charge failed.');
    } finally {
      setMockLoading(false);
    }
  }, [demoEnabled, mockAmount, mockChargerId, mockEnergy, loadData]);

  const handleRemovePayment = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deletePaymentMethod(id);
      setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete payment method.');
    } finally {
      setDeletingId(null);
    }
  };

  const openAddCard = async () => {
    setAddOpen(true);
    setError(null);

    if (!stripePromise) {
      setError('Stripe publishable key is not configured.');
      return;
    }

    setSetupLoading(true);
    try {
      const response = await createPaymentSetupIntent();
      const clientSecret = (response as { clientSecret?: string }).clientSecret;
      if (!clientSecret) {
        throw new Error('Setup intent missing client secret');
      }
      setSetupSecret(clientSecret);
    } catch (err: any) {
      setError(err?.message ?? 'Unable to start card setup.');
      setAddOpen(false);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleSavedMethod = (method: PaymentMethod) => {
    setPaymentMethods((prev) => [method, ...prev]);
    setAddOpen(false);
    setSetupSecret(null);
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen w-full">
      <div className="sm:hidden flex items-center gap-3 p-3 bg-white border-b border-gray-200">
        <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-medium text-gray-900">Billing & History</h1>
      </div>
      <MenuPanel isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-6xl mx-auto p-6 sm:p-8 lg:p-12">
          <div className="mb-8">
            <h1 className="hidden sm:block text-2xl sm:text-3xl text-gray-900 mb-2">Billing & History</h1>
            <p className="text-sm text-gray-500">Review your payments and saved methods</p>
          </div>

          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-start gap-2">
              <span className="font-semibold">Heads up:</span>
              <span>{error}</span>
            </div>
          )}

          {demoEnabled && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Zap className="w-4 h-4" /> Demo charge (dev only)
                  </p>
                  <p className="text-xs text-blue-900">
                    Creates a mock charging session for the signed-in user using Stripe test data.
                  </p>
                </div>
                {mockMessage && (
                  <Badge variant="secondary" className="justify-start whitespace-nowrap">
                    {mockMessage}
                  </Badge>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="mock-charger">Charger ID</Label>
                  <Input
                    id="mock-charger"
                    value={mockChargerId}
                    onChange={(e) => setMockChargerId(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mock-amount">Amount (EUR)</Label>
                  <Input
                    id="mock-amount"
                    value={mockAmount}
                    onChange={(e) => setMockAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mock-energy">Energy (kWh)</Label>
                  <Input
                    id="mock-energy"
                    value={mockEnergy}
                    onChange={(e) => setMockEnergy(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={triggerMockCharge} disabled={mockLoading}>
                  {mockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create mock session'}
                </Button>
                <p className="text-xs text-blue-900">
                  Uses Stripe test token (tok_visa). Disabled automatically when NEXT_PUBLIC_ENABLE_MOCK_SESSION is not set.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="bg-white rounded-lg border border-gray-200 p-6 lg:col-span-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Payment Methods</h2>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{paymentMethods.length}</Badge>
                  <Button size="sm" onClick={openAddCard}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading methods...
                </div>
              ) : paymentMethods.length === 0 ? (
                <p className="text-sm text-gray-500">No payment methods saved.</p>
              ) : (
                <div className="space-y-3">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <CreditCard className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {method.provider} •••• {method.tokenLast4}
                          </p>
                          <p className="text-xs text-gray-500">Added {formatDate(method.createdAt)}</p>
                          <Badge variant={method.status === 'valid' ? 'secondary' : 'outline'} className="mt-1">
                            {method.status}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemovePayment(method.id)}
                        disabled={deletingId === method.id}
                      >
                        {deletingId === method.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 text-red-600" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-4">
                Payment methods are managed via your provider. Contact support if you need to add a new card.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Billing History</h2>
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
                  <button
                    onClick={() => setSpendingView((v) => v === 'monthly' ? null : 'monthly')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      spendingView === 'monthly'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setSpendingView((v) => v === 'yearly' ? null : 'yearly')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      spendingView === 'yearly'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Yearly
                  </button>
                  <button
                    onClick={() => setSpendingView((v) => v === 'stats' ? null : 'stats')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      spendingView === 'stats'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Stats
                  </button>
                </div>
              </div>

              {!loading && history.length > 0 && spendingView !== null && (
                <div className="mb-5 rounded-lg border border-gray-100 bg-gray-50 p-4">
                  {spendingView === 'monthly' ? (
                    <>
                      <div className="space-y-2">
                        {monthlySummary.map((m) => (
                          <div key={m.key} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{m.label}</span>
                            <span className={`font-medium ${m.total > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                              {formatAmount(m.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">6-Month Total</span>
                        <span className="font-semibold text-gray-900">
                          {formatAmount(monthlySummary.reduce((s, m) => s + m.total, 0))}
                        </span>
                      </div>
                    </>
                  ) : spendingView === 'yearly' ? (
                    <>
                      <div className="space-y-2">
                        {yearlySummary.length === 0 ? (
                          <p className="text-sm text-gray-400">No completed payments yet.</p>
                        ) : (
                          yearlySummary.map((y) => (
                            <div key={y.year} className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">{y.year}</span>
                              <span className="font-medium text-gray-900">{formatAmount(y.total)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">All-Time Total</span>
                        <span className="font-semibold text-gray-900">{formatAmount(grandTotal)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-2">
                          <label htmlFor="stats-from" className="text-xs text-gray-500">From</label>
                          <input
                            id="stats-from"
                            type="date"
                            value={statsFrom}
                            onChange={(e) => setStatsFrom(e.target.value)}
                            className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-900 bg-white"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label htmlFor="stats-to" className="text-xs text-gray-500">To</label>
                          <input
                            id="stats-to"
                            type="date"
                            value={statsTo}
                            onChange={(e) => setStatsTo(e.target.value)}
                            className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-900 bg-white"
                          />
                        </div>
                      </div>
                      {periodStats.sessionCount === 0 ? (
                        <p className="text-sm text-gray-400">No completed sessions in this period.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Total Spent</p>
                            <p className="text-lg font-semibold text-gray-900">{formatAmount(periodStats.totalSpent)}</p>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Total Energy</p>
                            <p className="text-lg font-semibold text-gray-900">{periodStats.totalKWh.toFixed(2)} kWh</p>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Sessions</p>
                            <p className="text-lg font-semibold text-gray-900">{periodStats.sessionCount}</p>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Avg Cost / Session</p>
                            <p className="text-lg font-semibold text-gray-900">{formatAmount(periodStats.avgCost)}</p>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Avg Energy / Session</p>
                            <p className="text-lg font-semibold text-gray-900">{periodStats.avgKWh.toFixed(2)} kWh</p>
                          </div>
                          <div className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs text-gray-500">Most Used Charger</p>
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {periodStats.topCharger?.name ?? '—'}
                            </p>
                            {periodStats.topCharger && (
                              <p className="text-xs text-gray-500">{periodStats.topCharger.count} session{periodStats.topCharger.count !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading billing history...
                </div>
              ) : history.length === 0 ? (
                <div className="text-sm text-gray-500">No payments yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Charger</TableHead>
                        <TableHead>Energy</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">{formatDate(entry.createdAt)}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              <div>
                                <div className="font-medium text-gray-900">
                                  {entry.session?.chargerName ?? `Session #${entry.sessionId}`}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {entry.session?.chargerAddress ?? '—'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {entry.session ? `${entry.session.energyKWh.toFixed(2)} kWh` : '—'}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{formatAmount(entry.amountEur)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[entry.status]}>{entry.status}</Badge>
                            {entry.providerRef && (
                              <div className="text-[11px] text-gray-500 mt-1">Ref: {entry.providerRef}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.session?.invoice ? (
                              entry.session.invoice.pdfUrl && entry.session.invoice.pdfUrl !== 'pending' ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={entry.session.invoice.pdfUrl} target="_blank" rel="noreferrer">
                                    <FileText className="w-4 h-4 mr-1" /> View
                                  </a>
                                </Button>
                              ) : (
                                <Badge variant="outline">Pending</Badge>
                              )
                            ) : (
                              <span className="text-xs text-gray-500">Not issued</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={(v) => {
        setAddOpen(v);
        if (!v) setSetupSecret(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a card</DialogTitle>
            <DialogDescription>Save a card for automatic charging payments.</DialogDescription>
          </DialogHeader>

          {setupLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparing secure form...
            </div>
          )}

          {!setupLoading && setupSecret && stripePromise && (
            <Elements stripe={stripePromise}>
              <AddCardForm
                clientSecret={setupSecret}
                onSaved={handleSavedMethod}
                onError={(msg) => setError(msg)}
              />
            </Elements>
          )}

          {!stripePromise && (
            <p className="text-sm text-red-700">Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>
          )}
        </DialogContent>
      </Dialog>

      <div className="hidden sm:block sm:w-80 lg:w-96 flex-shrink-0">
        <SideMenu />
      </div>
    </div>
  );
}

function AddCardForm({ clientSecret, onSaved, onError }: {
  clientSecret: string;
  onSaved: (method: PaymentMethod) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholder, setCardholder] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!stripe || !elements) {
      setLocalError('Stripe is not ready yet.');
      return;
    }

    const card = elements.getElement(CardElement);
    if (!card) {
      setLocalError('Card element not available.');
      return;
    }

    setSaving(true);
    try {
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card,
          billing_details: cardholder ? { name: cardholder } : undefined,
        },
      });

      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to save card.');
      }

      const paymentMethodId = result.setupIntent.payment_method;
      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        throw new Error('Missing payment method from Stripe.');
      }

      const saved = await savePaymentMethodToken(paymentMethodId);
      const pm = (saved as { paymentMethod?: PaymentMethod }).paymentMethod ?? (saved as PaymentMethod);
      onSaved(pm);
    } catch (err: any) {
      const msg = err?.message ?? 'Could not add card.';
      setLocalError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cardholder">Cardholder Name</Label>
        <Input
          id="cardholder"
          value={cardholder}
          onChange={(e) => setCardholder(e.target.value)}
          placeholder="Jane Doe"
        />
      </div>

      <div className="space-y-2">
        <Label>Card Details</Label>
        <div className="border rounded-md px-3 py-2 bg-gray-50">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#111827',
                  '::placeholder': { color: '#9CA3AF' },
                },
                invalid: { color: '#dc2626' },
              },
            }}
          />
        </div>
      </div>

      {localError && <p className="text-sm text-red-700">{localError}</p>}

      <DialogFooter>
        <Button type="submit" disabled={saving || !stripe}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Card'}
        </Button>
      </DialogFooter>
    </form>
  );
}
