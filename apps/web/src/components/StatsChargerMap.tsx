"use client";

import { Map, Overlay } from "pigeon-maps";
import { Activity, MapPin, PlugZap, Zap } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "./ui/badge";

export type StatsChargerMapItem = {
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
  providerName?: string;
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(value);
}

function formatKWh(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} kWh`;
}

function markerColor(status: string) {
  if (status === "OUTAGE") return "#ef4444";
  if (status === "IN_USE") return "#f59e0b";
  return "#2563eb";
}

function statusLabel(status: string) {
  if (status === "IN_USE") return "In Use";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function StatsChargerMap({
  chargers,
  emptyText,
}: {
  chargers: StatsChargerMapItem[];
  emptyText: string;
}) {
  const validChargers = chargers.filter((charger) => Number.isFinite(charger.lat) && Number.isFinite(charger.lng));
  const [selectedId, setSelectedId] = useState<number | null>(validChargers[0]?.chargerId ?? null);

  const selected = validChargers.find((charger) => charger.chargerId === selectedId) ?? validChargers[0] ?? null;
  const center = useMemo<[number, number]>(() => {
    if (selected) return [selected.lat, selected.lng];
    return [37.9838, 23.7275];
  }, [selected]);

  if (validChargers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <div className="h-[520px] overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Map
          center={center}
          zoom={12}
          attribution={<span>© OpenStreetMap contributors © CARTO</span>}
          provider={(x, y, z) =>
            `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}${window.devicePixelRatio >= 2 ? "@2x" : ""}.png`
          }
        >
          {validChargers.map((charger) => {
            const active = selected?.chargerId === charger.chargerId;
            return (
              <Overlay key={charger.chargerId} anchor={[charger.lat, charger.lng]} offset={[0, 0]}>
                <button
                  type="button"
                  onClick={() => setSelectedId(charger.chargerId)}
                  className="flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110"
                  style={{
                    width: active ? 34 : 26,
                    height: active ? 34 : 26,
                    backgroundColor: markerColor(charger.status),
                  }}
                  aria-label={`View statistics for ${charger.name}`}
                >
                  <PlugZap className="h-4 w-4 text-white" />
                </button>
              </Overlay>
            );
          })}
        </Map>
      </div>

      <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">{selected.providerName ?? "Owned charger"}</p>
                <h3 className="mt-1 text-lg font-medium text-gray-950">{selected.name}</h3>
              </div>
              <Badge variant="outline">{statusLabel(selected.status)}</Badge>
            </div>

            <div className="mt-4 flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span>{selected.address ?? `${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}`}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniMapStat icon={Activity} label="Sessions" value={`${selected.sessions}`} />
              <MiniMapStat icon={Zap} label="Energy" value={formatKWh(selected.kWh)} />
              <MiniMapStat icon={PlugZap} label="Power" value={`${selected.maxKW} kW`} />
              <MiniMapStat icon={Activity} label="Revenue" value={formatEuro(selected.revenueEur)} />
            </div>

            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              {selected.connectorType} connector. Statistics come from completed sessions and provider usage records in the current analytics period.
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function MiniMapStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="mt-1 text-sm font-medium text-gray-950">{value}</p>
    </div>
  );
}
