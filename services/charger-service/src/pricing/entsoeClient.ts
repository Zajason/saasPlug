import axios from "axios";
import * as xml2js from "xml2js";
import { ENTSOE_ZONES, ZoneKey } from "./zones.ts";

const ENTSOE_API_URL = "https://web-api.tp.entsoe.eu/api";

// ENTSO-E wants YYYYMMDDHHmm in UTC.
function fmtUtc(dt: Date) {
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const min = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${min}`;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

type HourlyPrice = { tsUtc: Date; eurPerKWh: number };

function clampWholesale(eurPerKWh: number) {
  // Guardrails: wholesale can be negative sometimes; clamp to sane range for retail calcs.
  return Math.max(-0.05, Math.min(eurPerKWh, 2.0));
}

function pickNowHourOrClosest(all: HourlyPrice[], now: Date): number {
  if (all.length === 0) return 0.12;

  const nowHour = new Date(now);
  nowHour.setUTCMinutes(0, 0, 0);

  const exact = all.find((x) => x.tsUtc.getTime() === nowHour.getTime());
  const chosen =
    exact ??
    all.reduce((best, cur) =>
      Math.abs(cur.tsUtc.getTime() - nowHour.getTime()) <
      Math.abs(best.tsUtc.getTime() - nowHour.getTime())
        ? cur
        : best
    );

  return clampWholesale(chosen.eurPerKWh);
}

async function fetchZoneLatestWholesalePrice(zoneId: string, token: string): Promise<number> {
  // Pull a wide enough window to survive timezone/DST quirks and publication offsets.
  const now = new Date();
  const start = new Date(now.getTime() - 12 * 60 * 60 * 1000); // -12h
  const end = new Date(now.getTime() + 36 * 60 * 60 * 1000); // +36h

  const url =
    `${ENTSOE_API_URL}?securityToken=${token}` +
    `&documentType=A44` +
    `&in_Domain=${zoneId}&out_Domain=${zoneId}` +
    `&periodStart=${fmtUtc(start)}` +
    `&periodEnd=${fmtUtc(end)}`;

  const resp = await axios.get(url, { responseType: "text" });

  const parsed = await xml2js.parseStringPromise(resp.data, {
    explicitArray: false,
    mergeAttrs: true,
  });

  const doc = parsed?.Publication_MarketDocument;
  const timeSeriesList = asArray(doc?.TimeSeries);

  // Collect all hourly points from all time series/periods.
  const all: HourlyPrice[] = [];

  for (const ts of timeSeriesList) {
    const periods = asArray(ts?.Period);
    for (const p of periods) {
      const timeInterval = p?.timeInterval;
      const startStr = timeInterval?.start;
      if (!startStr) continue;

      const periodStartUtc = new Date(startStr); // usually ISO string
      const points = asArray(p?.Point);

      for (const pt of points) {
        const pos = Number(pt?.position);
        const eurPerMWh = Number(pt?.["price.amount"]);
        if (!Number.isFinite(pos) || !Number.isFinite(eurPerMWh)) continue;

        // Position is 1-based hourly step from Period start.
        const tsUtc = new Date(periodStartUtc.getTime() + (pos - 1) * 60 * 60 * 1000);
        const eurPerKWh = eurPerMWh / 1000;

        all.push({ tsUtc, eurPerKWh });
      }
    }
  }

  return pickNowHourOrClosest(all, now);
}

/**
 * Fetch hourly day-ahead prices and return a mapping of zoneKey -> EUR/kWh (for "now" hour).
 * If a zone fails, it falls back to 0.12 for that zone (and logs the failure).
 */
export async function fetchLatestWholesalePrice(): Promise<Record<string, number>> {
  const token = process.env.ENTSOE_TOKEN;
  if (!token) throw new Error("ENTSOE_TOKEN missing in environment");

  const zoneEntries = Object.entries(ENTSOE_ZONES) as Array<[ZoneKey, { id: string; name: string; center: [number, number] }]>;

  // ENTSO-E can rate-limit; keep concurrency modest.
  const CONCURRENCY = 8;
  const result: Record<string, number> = {};

  let idx = 0;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < zoneEntries.length) {
      const myIdx = idx++;
      const [zoneKey, zone] = zoneEntries[myIdx];

      try {
        result[zoneKey] = await fetchZoneLatestWholesalePrice(zone.id, token);
      } catch (err) {
        console.error(`ENTSO-E fetch failed for ${zoneKey} (${zone.name})`, err);
        result[zoneKey] = 0.12;
      }
    }
  });

  await Promise.all(workers);
  return result;
}
