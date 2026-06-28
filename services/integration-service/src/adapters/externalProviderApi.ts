// #40 Mock ExternalProviderAPI adapter.
//
// Each charging provider (redPlug / greenPlug / bluePlug) exposes a different
// REST contract. These adapters call each provider (real HTTP or built-in
// mock data) and normalize every response into a single canonical shape so
// the rest of saasPlug never has to care which provider a charger came from.

import { ChargerStatus, ConnectorType } from "@prisma/client";
import { mockRawData } from "./mockData.ts";

// Canonical, provider-agnostic charger shape produced by every adapter.
export type NormalizedCharger = {
  externalProvider: string;
  externalId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  status: ChargerStatus;
  connectorType: ConnectorType;
  maxKW: number;
  kwhPrice: number;
};

export type AdapterOptions = {
  baseUrl?: string;
  apiKey?: string;
  useMock?: boolean;
};

export interface ExternalProviderAdapter {
  readonly externalProvider: string;
  listChargers(): Promise<NormalizedCharger[]>;
  reserveCharger(externalId: string, minutes: number): Promise<boolean>;
}

export const EXTERNAL_PROVIDERS = ["redPlug", "greenPlug", "bluePlug"] as const;
export type ExternalProviderName = (typeof EXTERNAL_PROVIDERS)[number];

// Base URLs taken from the provider OpenAPI specs (docs/provider-apis/*.yaml).
export const DEFAULT_BASE_URLS: Record<ExternalProviderName, string> = {
  redPlug: "https://davinci.softlab.ntua.gr/saas26/redPlug/api",
  greenPlug: "https://davinci.softlab.ntua.gr/saas26/greenPlug/api",
  bluePlug: "https://davinci.softlab.ntua.gr/saas26/bluePlug/api",
};

export function isExternalProvider(value: string): value is ExternalProviderName {
  return (EXTERNAL_PROVIDERS as readonly string[]).includes(value);
}

// ---------- normalization helpers ----------
const DEFAULT_KWH_PRICE = 0.25;

const asNumber = (raw: unknown, fallback = 0): number => {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const firstValue = <T>(...values: Array<T | null | undefined>): T | undefined =>
  values.find((value): value is T => value !== null && value !== undefined);

const mapStatus = (raw: string | null | undefined): ChargerStatus => {
  const s = (raw ?? "").toLowerCase();
  if (["charging", "reserved", "in_use", "inuse", "occupied", "busy"].includes(s)) {
    return ChargerStatus.IN_USE;
  }
  if (["malfunction", "offline", "outage", "error", "fault", "unavailable"].includes(s)) {
    return ChargerStatus.OUTAGE;
  }
  return ChargerStatus.AVAILABLE;
};

const mapConnector = (raw: string | null | undefined): ConnectorType => {
  const s = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.includes("CCS")) return ConnectorType.CCS;
  if (s.includes("CHADEMO")) return ConnectorType.CHADEMO;
  if (s.includes("TYPE1") || s === "J1772") return ConnectorType.TYPE1;
  if (s.includes("SCHUKO")) return ConnectorType.SCHUKO;
  if (s.includes("TYPE2") || s.includes("MENNEKES")) return ConnectorType.TYPE2;
  return ConnectorType.TYPE2;
};

// ---------- raw response types (mirror the provider OpenAPI specs) ----------
type RedPoint = {
  pointid: number | string;
  status: string;
  cap: number;
  connector?: string | null;
  locationName?: string | null;
  address?: string | null;
  lon?: number | string;
  long?: number | string;
  lat: number | string;
  kwhprice?: number | string;
};

type GreenPoint = {
  id?: number | string;
  pointid?: number | string;
  state?: string;
  status?: string;
  kwhRateEur?: number | string;
  kwhprice?: number | string;
  cap: number;
  connector?: string | null;
  locationName?: string | null;
  address?: string | null;
  coords?: { long?: number | string; lon?: number | string; lat: number | string };
  lon?: number | string;
  lat?: number | string;
};

type BluePoint = {
  chargerId?: number | string;
  pointid?: number | string;
  currentStatus?: string;
  status?: string;
  pricePerKwh?: number | string;
  kwhprice?: number | string;
  cap: number;
  connector?: string | null;
  locationName?: string | null;
  address?: string | null;
  geo?: Array<number | string>;
  lon?: number | string;
  lat?: number | string;
};

// ---------- HTTP fetch (real mode) ----------
async function fetchJson(url: string, apiKey?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`External provider API ${url} responded ${res.status}`);
  }
  return res.json();
}

// Helper for POST requests
async function postJson(url: string, apiKey?: string, body?: any): Promise<unknown> {
  const headers: Record<string, string> = { 
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (apiKey) headers.Authorization = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;

  const res = await fetch(url, { 
    method: "POST", 
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!res.ok) {
    throw new Error(`External provider API ${url} responded ${res.status}`);
  }
  
  const text = await res.text();
  return text ? JSON.parse(text) : { ok: true };
}

// ---------- per-provider adapters ----------
class RedPlugAdapter implements ExternalProviderAdapter {
  readonly externalProvider = "redPlug";
  constructor(private readonly opts: AdapterOptions) {}

  async listChargers(): Promise<NormalizedCharger[]> {
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.redPlug;
    const raw = (this.opts.useMock
      ? mockRawData.redPlug
      : await fetchJson(`${baseUrl}/points`, this.opts.apiKey)) as RedPoint[];

    return raw.map((p) => ({
      externalProvider: this.externalProvider,
      externalId: String(p.pointid),
      name: p.locationName ?? `redPlug #${p.pointid}`,
      address: p.address ?? null,
      lat: asNumber(p.lat),
      lng: asNumber(firstValue(p.lon, p.long)),
      status: mapStatus(p.status),
      connectorType: mapConnector(p.connector),
      maxKW: asNumber(p.cap),
      kwhPrice: asNumber(p.kwhprice, DEFAULT_KWH_PRICE),
    }));
  }

  async reserveCharger(externalId: string, minutes: number): Promise<boolean> {
    if (this.opts.useMock) return true;
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.redPlug;
    await postJson(`${baseUrl}/reserve/${externalId}/${minutes}`, this.opts.apiKey);
    return true;
  }
}

class GreenPlugAdapter implements ExternalProviderAdapter {
  readonly externalProvider = "greenPlug";
  constructor(private readonly opts: AdapterOptions) {}

  async listChargers(): Promise<NormalizedCharger[]> {
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.greenPlug;
    const raw = (this.opts.useMock
      ? mockRawData.greenPlug
      : await fetchJson(`${baseUrl}/chargingPoints`, this.opts.apiKey)) as GreenPoint[];

    return raw.map((p) => ({
      externalProvider: this.externalProvider,
      externalId: String(firstValue(p.id, p.pointid)),
      name: p.locationName ?? `greenPlug #${firstValue(p.id, p.pointid)}`,
      address: p.address ?? null,
      lat: asNumber(firstValue(p.coords?.lat, p.lat)),
      lng: asNumber(firstValue(p.coords?.lon, p.coords?.long, p.lon)),
      status: mapStatus(firstValue(p.state, p.status)),
      connectorType: mapConnector(p.connector),
      maxKW: asNumber(p.cap),
      kwhPrice: asNumber(firstValue(p.kwhRateEur, p.kwhprice), DEFAULT_KWH_PRICE),
    }));
  }

  async reserveCharger(externalId: string, minutes: number): Promise<boolean> {
    if (this.opts.useMock) return true;
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.greenPlug;
    // GreenPlug API spec uses body for reservations
    await postJson(`${baseUrl}/chargingPoints/${externalId}/reservations`, this.opts.apiKey, { minutes });
    return true;
  }
}

class BluePlugAdapter implements ExternalProviderAdapter {
  readonly externalProvider = "bluePlug";
  constructor(private readonly opts: AdapterOptions) {}

  async listChargers(): Promise<NormalizedCharger[]> {
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.bluePlug;
    const raw = (this.opts.useMock
      ? mockRawData.bluePlug
      : await fetchJson(`${baseUrl}/locations`, this.opts.apiKey)) as BluePoint[];

    return raw.map((p) => ({
      externalProvider: this.externalProvider,
      externalId: String(firstValue(p.chargerId, p.pointid)),
      name: p.locationName ?? `bluePlug #${firstValue(p.chargerId, p.pointid)}`,
      address: p.address ?? null,
      // bluePlug `geo` is [long, lat] (WGS84), consistent with the other specs.
      lat: asNumber(firstValue(p.geo?.[1], p.lat)),
      lng: asNumber(firstValue(p.geo?.[0], p.lon)),
      status: mapStatus(firstValue(p.currentStatus, p.status)),
      connectorType: mapConnector(p.connector),
      maxKW: asNumber(p.cap),
      kwhPrice: asNumber(firstValue(p.pricePerKwh, p.kwhprice), 0.59),
    }));
  }

  async reserveCharger(externalId: string, minutes: number): Promise<boolean> {
    if (this.opts.useMock) return true;
    const baseUrl = this.opts.baseUrl ?? DEFAULT_BASE_URLS.bluePlug;
    await postJson(`${baseUrl}/location/${externalId}/hold?minutes=${minutes}`, this.opts.apiKey);
    return true;
  }
}

// Factory: returns the adapter for a provider. Mock mode is the default and
// is disabled only when INTEGRATION_USE_MOCK is explicitly "false".
export function getAdapter(
  externalProvider: string,
  opts: AdapterOptions = {},
): ExternalProviderAdapter {
  const useMock = opts.useMock ?? process.env.INTEGRATION_USE_MOCK !== "false";
  const resolved: AdapterOptions = { ...opts, useMock };

  switch (externalProvider) {
    case "redPlug":
      return new RedPlugAdapter(resolved);
    case "greenPlug":
      return new GreenPlugAdapter(resolved);
    case "bluePlug":
      return new BluePlugAdapter(resolved);
    default:
      throw new Error(`Unknown external provider: ${externalProvider}`);
  }
}
