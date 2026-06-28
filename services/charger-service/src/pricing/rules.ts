import { ConnectorType } from "@prisma/client";
import { ENTSOE_ZONES, ZoneKey } from "./zones.ts";

function roundToCents(x: number) {
  return Math.round(x * 100) / 100;
}
function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

// peak window: 18:00–22:00 local time
function isPeakHourLocal(now = new Date()) {
  const h = now.getHours(); // server local time (set TZ properly in prod)
  return h >= 18 && h < 22;
}

export function computeRetailPrice({
  wholesaleEurPerKWh,
  connectorType,
  maxKW,
  now = new Date(),
}: {
  wholesaleEurPerKWh: number;
  connectorType: ConnectorType | string;
  maxKW: number;
  now?: Date;
}): number {
  const isDC = maxKW >= 40 || connectorType === "CCS" || connectorType === "CHADEMO";

  const VAT = 0.24;

  const operatorFee = isDC ? 0.05 : 0.03;
  const gridAdder = isDC ? 0.06 : 0.03;

  const marginRate = isDC ? 0.35 : 0.22;

  const connectorPremium =
    connectorType === "CCS" ? 0.03 :
    connectorType === "CHADEMO" ? 0.02 :
    connectorType === "TYPE2" ? 0.00 : 0.01;

  const powerPremium = isDC ? clamp((maxKW - 50) * 0.0009, 0, 0.12) : 0;

  // ✅ peak adder (your values)
  const peakAdder = isPeakHourLocal(now) ? (isDC ? 0.05 : 0.03) : 0;

  const energyComponent = clamp(wholesaleEurPerKWh, 0.0, 1.5);

  const preMargin =
    energyComponent +
    operatorFee +
    gridAdder +
    connectorPremium +
    powerPremium +
    peakAdder;

  const withMargin = preMargin * (1 + marginRate);
  const withVat = withMargin * (1 + VAT);

  const floored = isDC ? Math.max(withVat, 0.39) : Math.max(withVat, 0.19);
  const capped = isDC ? Math.min(floored, 0.99) : Math.min(floored, 0.69);

  return roundToCents(capped);
}

/**
 * Map lat/lng to the closest ENTSO-E zone center (simple nearest-center heuristic).
 * Returns a zoneKey like "GR", "DE", "IT", "NO1", etc.
 */
export function mapLatLngToZone(lat: number, lng: number): ZoneKey {
  // Haversine distance in km
  const R = 6371;

  const toRad = (d: number) => (d * Math.PI) / 180;

  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  let bestKey: ZoneKey = "GR";
  let bestDist = Number.POSITIVE_INFINITY;

  const entries = Object.entries(ENTSOE_ZONES) as Array<[ZoneKey, { center: [number, number] }]>;

  for (const [key, meta] of entries) {
    const [cLat, cLng] = meta.center;
    const d = haversineKm(lat, lng, cLat, cLng);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }

  return bestKey;
}
