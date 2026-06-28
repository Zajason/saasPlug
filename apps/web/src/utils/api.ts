// utils/api.ts
import type { CarApi } from "../types/ownership";

function getBaseUrl() {
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  if (baseUrl.startsWith("http://localhost:4000")) {
    return "http://localhost:8080/api/v1";
  }

  return baseUrl;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function getErrorMessage(body: unknown, fallback: string) {
  if (!body) return fallback;
  if (typeof body === "string" && body.trim().length > 0) return body.trim();
  if (typeof body === "object" && body !== null) {
    const maybeMsg =
      (body as { error?: unknown; message?: unknown }).error ??
      (body as { message?: unknown }).message;
    if (typeof maybeMsg === "string" && maybeMsg.trim().length > 0) return maybeMsg.trim();
  }
  return fallback;
}

/** ---------------------------
 *  Auth token utilities
 *  --------------------------*/

export class AuthError extends Error {
  name = "AuthError";
}

export const AUTH_CHANGED_EVENT = "auth-changed";
export const AUTH_TOKEN_KEY = "authToken";

export type UserRole = "EV_USER" | "PROVIDER_ADMIN" | "PLATFORM_OPERATOR";

type AuthPayload = {
  userId?: number;
  role?: string;
  exp?: number;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return window.atob(padded);
}

export function getAuthPayloadFromToken(token: string | null): AuthPayload | null {
  if (!token || typeof window === "undefined") return null;

  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload)) as AuthPayload;
  } catch {
    return null;
  }
}

export function getRoleFromToken(token: string | null): UserRole | null {
  const role = getAuthPayloadFromToken(token)?.role;
  if (role === "EV_USER" || role === "PROVIDER_ADMIN" || role === "PLATFORM_OPERATOR") {
    return role;
  }
  return null;
}

export function getAuthRole(): UserRole | null {
  return getRoleFromToken(getAuthToken());
}

export function getHomePathForRole(role: UserRole | null) {
  if (role === "PROVIDER_ADMIN") return "/provider";
  if (role === "PLATFORM_OPERATOR") return "/operator";
  return "/";
}

/**
 * Reads token from sessionStorage first (non-remember),
 * then localStorage (remember me).
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  const sessionToken = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken && sessionToken.trim().length > 0) return sessionToken;

  const localToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (localToken && localToken.trim().length > 0) return localToken;

  return null;
}

export function isLoggedIn(): boolean {
  return !!getAuthToken();
}

/**
 * Store token consistently with SignInScreen behavior.
 */
export function setAuthToken(token: string, rememberMe: boolean) {
  if (typeof window === "undefined") return;

  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  const other = rememberMe ? window.sessionStorage : window.localStorage;

  storage.setItem(AUTH_TOKEN_KEY, token);
  other.removeItem(AUTH_TOKEN_KEY);

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** ---------------------------
 *  Internal fetch helper (supports auth)
 *  --------------------------*/

async function fetchJson(path: string, init?: RequestInit & { auth?: boolean }) {
  const baseUrl = getBaseUrl();
  const auth = init?.auth ?? false;

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    Accept: "application/json",
  };

  if (auth) {
    const token = getAuthToken();
    if (!token) throw new AuthError("You must be signed in to do that.");
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthError("Your session expired. Please sign in again.");
    }
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `API request failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

/** ---------------------------
 *  Public (no-auth) endpoints
 *  --------------------------*/

export async function fetchChargers() {
  // Attach token if present so backend can mark `reserved_by_me`
  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/points`, { cache: "no-store", headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error: ${res.status} ${text}`);
  }

  return res.json();
}

export async function googleSignIn(googleToken: string) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: googleToken }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await parseJsonSafe(res);
    throw new Error(getErrorMessage(body, `Google sign-in failed (${res.status})`));
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Google sign-in succeeded but token is missing");
  return data;
}

export async function signIn(credentials: { email: string; password: string }) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Sign-in failed (${res.status})`);
    throw new Error(message);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token || typeof data.token !== "string") {
    throw new Error("Sign-in succeeded but token is missing in the response");
  }

  return data; // { token }
}

export async function signUp(payload: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: Extract<UserRole, "EV_USER" | "PROVIDER_ADMIN">;
}) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Sign-up failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

export type ProviderProfile = {
  id: number;
  name: string;
  legalName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  country: string | null;
  status: string;
};

export type RegisterProviderPayload = {
  name: string;
  legalName?: string;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
};

export type ProviderApiConfig = {
  id: number;
  providerId: number;
  externalProvider: "redPlug" | "greenPlug" | "bluePlug" | string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  lastSyncedAt: string | null;
};

export type SyncedProviderCharger = {
  id: number;
  providerId: number;
  externalProvider: string;
  externalId: string;
  chargerId: number;
  lastSyncedAt: string;
  charger: {
    id: number;
    name: string;
    address: string | null;
    lat: number;
    lng: number;
    status: "AVAILABLE" | "IN_USE" | "OUTAGE" | string;
    connectorType: string;
    maxKW: number;
    kwhprice: number;
  } | null;
};

export type IntegrationSyncSummary = {
  externalProvider: string;
  created: number;
  updated: number;
  total: number;
  webhookEventsRecorded: number;
};

export type AnalyticsDay = {
  date: string;
  label: string;
  sessions: number;
  kWh: number;
  revenueEur: number;
};

export type ProviderAnalyticsReport = {
  provider: { id: number; name: string; status: string };
  period: { from: string; to: string };
  totals: {
    chargers: number;
    activeChargers: number;
    sessions: number;
    energyKWh: number;
    revenueEur: number;
    usageRecords: number;
    openInvoiceTotalEur: number;
    avgSessionMinutes: number;
    utilizationRate: number;
    exportJobs: number;
  };
  usageByDay: AnalyticsDay[];
  statusBreakdown: Record<string, number>;
  chargerBreakdown: Array<{
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
  }>;
  chargerMap: Array<{
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
  }>;
  apiConfigs: Array<{ externalProvider: string; enabled: boolean; lastSyncedAt: string | null }>;
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    totalEur: number;
    dueDate: string;
    usageRecordCount: number;
  }>;
};

export type GlobalAnalyticsReport = {
  period: { from: string; to: string };
  totals: {
    providers: number;
    activeProviders: number;
    chargers: number;
    activeChargers: number;
    sessions: number;
    energyKWh: number;
    revenueEur: number;
    openInvoiceTotalEur: number;
    exportJobs: number;
  };
  usageByDay: AnalyticsDay[];
  providerBreakdown: Array<{
    providerId: number;
    name: string;
    status: string;
    chargers: number;
    sessions: number;
    energyKWh: number;
    revenueEur: number;
    openInvoiceTotalEur: number;
    lastSync: string | null;
  }>;
  chargerMap: Array<{
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
    providerId: number;
    providerName: string;
  }>;
  serviceHealth: Array<{ service: string; status: string }>;
};

export type ExportJob = {
  id: number;
  providerId: number | null;
  scope: "PROVIDER" | "GLOBAL" | string;
  format: "CSV" | "JSON" | string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;
  fileName: string | null;
  downloadUrl: string | null;
  parameters: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AnalyticsExportType =
  | "USAGE_RECORDS"
  | "PROVIDER_DAILY"
  | "PROVIDER_CHARGERS"
  | "GLOBAL_PROVIDERS"
  | "GLOBAL_CHARGERS";

export type ProviderPlan = {
  id: number;
  code: string;
  name: string;
  monthlyFeeEur: number;
  perSessionFeeEur: number;
  features: unknown;
  active: boolean;
};

export type ProviderSubscription = {
  id: number;
  providerId: number;
  planId: number;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  startedAt: string;
  endedAt: string | null;
  plan: ProviderPlan | null;
};

export type ProviderPayment = {
  id: number;
  providerId?: number;
  invoiceId?: number;
  amountEur?: number;
  providerRef: string | null;
  status: string;
  paidAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProviderInvoice = {
  id: number;
  providerId: number;
  providerName: string | null;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotalEur: number;
  taxEur: number;
  totalEur: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  usageRecordCount: number;
  paymentCount: number;
};

export type ProviderInvoiceDetail = ProviderInvoice & {
  usageRecords: Array<{
    id: number;
    providerId: number;
    invoiceId: number | null;
    sourceType: string;
    sourceId: number | null;
    quantity: number;
    amountEur: number;
    occurredAt: string;
    metadata: unknown;
    createdAt: string;
  }>;
  payments: ProviderPayment[];
};

export type ProviderSubscriptionBilling = {
  provider: {
    id: number;
    name: string;
    status: string;
    contactEmail: string;
  };
  plans: ProviderPlan[];
  subscription: ProviderSubscription | null;
  invoices: ProviderInvoiceDetail[];
  invoiceSummary: ProviderInvoice[];
};

export async function fetchProviderProfile(): Promise<{ provider: ProviderProfile }> {
  return fetchJson("/providers/me", { auth: true });
}

export async function registerProvider(payload: RegisterProviderPayload): Promise<{ provider: ProviderProfile }> {
  return fetchJson("/providers/register", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProviderApiConfigs(): Promise<{ providerId: number; configs: ProviderApiConfig[] }> {
  return fetchJson("/integration/config", { auth: true });
}

export async function configureProviderApi(payload: {
  externalProvider: "redPlug" | "greenPlug" | "bluePlug";
  apiKey?: string;
  enabled?: boolean;
}): Promise<{ config: ProviderApiConfig }> {
  return fetchJson("/integration/config", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchSyncedProviderChargers(): Promise<{
  providerId: number;
  count: number;
  chargers: SyncedProviderCharger[];
}> {
  return fetchJson("/integration/chargers", { auth: true });
}

export async function syncProviderChargers(): Promise<{
  providerId: number;
  synced: IntegrationSyncSummary[];
}> {
  return fetchJson("/integration/sync", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchProviderAnalytics(params?: {
  from?: string;
  to?: string;
}): Promise<{ report: ProviderAnalyticsReport }> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return fetchJson(`/analytics/provider${query ? `?${query}` : ""}`, { auth: true });
}

export async function fetchGlobalAnalytics(params?: {
  from?: string;
  to?: string;
}): Promise<{ report: GlobalAnalyticsReport }> {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return fetchJson(`/analytics/global${query ? `?${query}` : ""}`, { auth: true });
}

export async function fetchProviderSubscriptionBilling(): Promise<ProviderSubscriptionBilling> {
  return fetchJson("/payments/provider/subscription", { auth: true });
}

export async function startProviderSubscription(planCode: string): Promise<{
  success: boolean;
  mock: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  subscription: ProviderSubscription;
  invoice: ProviderInvoiceDetail;
  payment?: ProviderPayment;
}> {
  return fetchJson("/payments/provider/subscription/start", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planCode }),
  });
}

export async function fetchProviderInvoices(params?: {
  providerId?: number;
  status?: string;
  limit?: number;
}): Promise<{ invoices: ProviderInvoice[] }> {
  const search = new URLSearchParams();
  if (params?.providerId) search.set("providerId", String(params.providerId));
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return fetchJson(`/payments/provider/invoices${query ? `?${query}` : ""}`, { auth: true });
}

export async function payProviderInvoice(invoiceId: number): Promise<{
  success: boolean;
  mock: boolean;
  clientSecret?: string;
  payment?: ProviderPayment;
  invoice?: ProviderInvoiceDetail;
}> {
  return fetchJson(`/payments/provider/invoices/${invoiceId}/pay`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "CARD" }),
  });
}

export async function confirmProviderPayment(paymentIntentId: string): Promise<{
  success: boolean;
  invoice: ProviderInvoiceDetail;
  payment: ProviderPayment;
  subscriptionUpdated: boolean;
}> {
  return fetchJson("/payments/provider/payments/confirm", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentIntentId }),
  });
}

export async function fetchExportJobs(scope?: "PROVIDER" | "GLOBAL"): Promise<{ exportJobs: ExportJob[] }> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return fetchJson(`/analytics/exports${query}`, { auth: true });
}

export async function createUsageExport(payload?: {
  from?: string;
  to?: string;
  scope?: "PROVIDER" | "GLOBAL";
  exportType?: AnalyticsExportType;
  format?: "CSV" | "JSON";
}): Promise<{ exportJob: ExportJob }> {
  return fetchJson("/analytics/exports", {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? { format: "CSV" }),
  });
}

export async function downloadExportJob(job: ExportJob) {
  if (!job.downloadUrl) {
    throw new Error("This export is not ready for download yet.");
  }

  const token = getAuthToken();
  if (!token) throw new AuthError("You must be signed in to download exports.");

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}${job.downloadUrl.replace(/^\/api\/v1/, "")}`, {
    headers: {
      Accept: "text/csv, application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthError("Your session expired. Please sign in again.");
    }
    const body = await parseJsonSafe(res);
    throw new Error(getErrorMessage(body, `Export download failed (${res.status})`));
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = job.fileName ?? `usage-export-${job.id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

/** ---------------------------
 *  Reservation endpoints (auth)
 *  --------------------------*/

export async function reserveCharger(chargerId: string, minutes?: number) {
  const token = getAuthToken();
  if (!token) throw new AuthError("You must be signed in to reserve a charger.");

  const baseUrl = getBaseUrl();
  const endpoint = minutes
    ? `${baseUrl}/reserve/${chargerId}/${minutes}`
    : `${baseUrl}/reserve/${chargerId}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Reservation failed (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

export async function cancelReservation(chargerId: string) {
  const token = getAuthToken();
  if (!token) throw new AuthError("You must be signed in to cancel a reservation.");

  return fetchJson(`/reserve/${chargerId}/cancel`, {
    method: "POST",
    auth: true,
  });
}

export async function fetchCharger(id: string) {
  // include auth if present so you can see reservationendtime if backend restricts it
  const token = getAuthToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/points/${id}`, { cache: "no-store", headers });

  if (!res.ok) {
    const body = await parseJsonSafe(res);
    const message = getErrorMessage(body, `Failed to fetch charger (${res.status})`);
    throw new Error(message);
  }

  return res.json();
}

/** ---------------------------
 * Authenticated endpoints
 * --------------------------*/

export async function fetchCarOwnerships() {
  // adjust if your backend is /api/v1/car-ownership etc.
  return fetchJson(`/car-ownership`, { auth: true });
}

export async function searchCars(query: string): Promise<CarApi[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed });
  const result = await fetchJson(`/cars/search?${params.toString()}`);
  return result as CarApi[];
}

export async function createCarOwnership(carId: number, color: string) {
  return fetchJson(`/car-ownership/${carId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color }),
    auth: true,
  });
}

export async function deleteCarOwnership(ownershipId: number) {
  return fetchJson(`/car-ownership/${ownershipId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchPaymentMethods() {
  return fetchJson(`/payments/methods`, { auth: true });
}

export async function deletePaymentMethod(methodId: number) {
  return fetchJson(`/payments/methods/${methodId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchUserProfile() {
  return fetchJson(`/me`, { auth: true });
}

export async function updateUserProfile(data: {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  preferences?: Record<string, unknown>;
}) {
  return fetchJson(`/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    auth: true,
  });
}

export async function fetchBillingHistory() {
  return fetchJson(`/payments/history`, { auth: true });
}

export async function createPaymentSetupIntent() {
  return fetchJson(`/payments/create-setup-intent`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function savePaymentMethodToken(paymentMethodId: string) {
  return fetchJson(`/payments/save-method`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethodId }),
  });
}

export async function runMockCharge(payload?: {
  chargerId?: number;
  amountEur?: number;
  kWh?: number;
  durationMinutes?: number;
}) {
  return fetchJson(`/mock/session`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

/** ---------------------------
 *  Charging session endpoints
 *  --------------------------*/

export async function startCharging(reservationId: number, battery?: { batteryCapacityKWh: number; currentBatteryLevel: number }) {
  return fetchJson(`/charging/start`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId, ...battery }),
  });
}

export async function stopCharging(sessionId: number) {
  return fetchJson(`/charging/stop`, {
    method: "POST",
    auth: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export async function getChargingStatus(sessionId: number) {
  return fetchJson(`/charging/status/${sessionId}`, { auth: true });
}

export async function getActiveSession() {
  return fetchJson(`/charging/active`, { auth: true });
}
