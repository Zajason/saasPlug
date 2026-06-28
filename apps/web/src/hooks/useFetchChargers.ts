// hooks/useFetchChargers.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import type { Charger } from "../types/charger";
import { fetchChargers, AUTH_CHANGED_EVENT } from "../utils/api";

type ApiPoint = {
  pointid: number | string;
  lat: string | number;
  lng?: string | number; // ✅ might exist
  lon?: string | number; // ✅ might exist
  status?: string;
  cap?: number;
  kwhprice?: number;

  name?: string;
  address?: string;
  providerName?: string;
  externalProvider?: string | null;
  connectorType?: string; // "CCS" | "CHADEMO" | "TYPE2"
  reserved_by_me?: boolean; // ✅ Added: whether current user has reserved this charger
  reservationSupported?: boolean;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  return NaN;
}

function normalizeStatus(s: unknown): Charger["status"] {
  const v = String(s ?? "available").toLowerCase();

  // handle a few common variants safely
  if (v === "available") return "available";
  if (v === "in_use" || v === "inuse" || v === "in-use" || v === "busy") return "in_use";
  if (v === "outage" || v === "offline" || v === "down") return "outage";

  return "available";
}

function normalizeConnector(c: unknown): Charger["connectorType"] {
  const v = String(c ?? "TYPE2").toUpperCase();

  if (v === "CCS") return "CCS";
  if (v === "CHADEMO") return "CHADEMO";
  return "TYPE2";
}

export function useFetchChargers() {
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Charger[]> => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchChargers();

      // ✅ backend might return [] OR { points: [] }
      const points: ApiPoint[] = Array.isArray(data) ? data : (data?.points ?? []);

      const normalized: Charger[] = points
        .filter((p) => {
          const rawLng = p.lng ?? p.lon;
          const lat = toNumber(p.lat);
          const lng = toNumber(rawLng);
          return Number.isFinite(lat) && Number.isFinite(lng);
        })
        .map((p) => {
          // ✅ accept both lng and lon (lon has priority fallback)
          const rawLng = p.lng ?? p.lon;

          const lat = toNumber(p.lat);
          const lng = toNumber(rawLng);

          return {
            id: String(p.pointid),
            lat,
            lng,
            status: normalizeStatus(p.status),

            name: p.name ?? "Unknown charger",
            address: p.address ?? "",
            providerName: p.providerName ?? "Unknown",
            externalProvider: p.externalProvider ?? null,

            connectorType: normalizeConnector(p.connectorType),
            maxKW: Number(p.cap ?? 0),
            kwhprice: Number(p.kwhprice ?? 0.25),
            reserved_by_me: p.reserved_by_me ?? false,
            reservationSupported: p.reservationSupported ?? true,
          } satisfies Charger;
        });

      console.log("normalized chargers:", normalized.length, normalized[0]);

      setChargers(normalized);
      return normalized;
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to load chargers");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch chargers when auth state changes (login/logout)
  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  }, [load]);

  return { chargers, loading, error, reload: load } as const;
}
