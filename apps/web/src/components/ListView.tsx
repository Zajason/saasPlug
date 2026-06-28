import { useMemo } from "react";
import { MapPin, Zap, Navigation, Badge } from "lucide-react";
import type { Charger } from "../types/charger";

interface ListViewProps {
  chargers: Charger[];
  userLocation: { lat: number; lng: number };
  onChargerSelect: (charger: Charger) => void;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function ListView({ chargers, userLocation, onChargerSelect }: ListViewProps) {
  const sortedChargers = useMemo(() => {
    // First sort by reserved_by_me (reserved first), then by distance
    const chargersWithDistance = chargers.map((charger) => ({
      ...charger,
      distance: calculateDistance(userLocation.lat, userLocation.lng, charger.lat, charger.lng),
    }));

    return chargersWithDistance
      .sort((a, b) => {
        // Reserved by current user comes first
        if (a.reserved_by_me && !b.reserved_by_me) return -1;
        if (!a.reserved_by_me && b.reserved_by_me) return 1;
        // Then sort by distance
        return a.distance - b.distance;
      })
      .slice(0, 20);
  }, [chargers, userLocation]);

  const getStatusColor = (status: Charger["status"]) => {
    switch (status) {
      case "available":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "in_use":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "outage":
        return "bg-red-100 text-red-700 border-red-200";
    }
  };

  const getStatusText = (status: Charger["status"]) => {
    switch (status) {
      case "available":
        return "Available";
      case "in_use":
        return "In Use";
      case "outage":
        return "Outage";
    }
  };

  const getStatusDot = (status: Charger["status"]) => {
    switch (status) {
      case "available":
        return "bg-blue-500";
      case "in_use":
        return "bg-orange-500";
      case "outage":
        return "bg-red-500";
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 lg:p-6">
        <div className="mb-4">
          <h2 className="text-lg sm:text-xl font-semibold mb-1">Nearby Chargers</h2>
          <p className="text-sm text-gray-600">Showing {sortedChargers.length} closest chargers</p>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {sortedChargers.map((charger, index) => (
            <button
              key={charger.id}
              onClick={() => onChargerSelect(charger)}
              className={`w-full rounded-lg p-3 sm:p-4 hover:shadow-md transition-all text-left ${
                charger.reserved_by_me
                  ? "bg-purple-50 border-2 border-purple-500 hover:border-purple-600"
                  : "bg-white border border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex flex-col items-center min-w-[60px] sm:min-w-[70px]">
                  <Navigation className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 mb-1" />
                  <span className="text-xs sm:text-sm font-medium text-gray-700">
                    {formatDistance((charger as any).distance)}
                  </span>
                  <span className="text-xs text-gray-500">#{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm sm:text-base text-gray-900 truncate">
                        {charger.name}
                      </h3>
                      {charger.reserved_by_me && (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500 text-white whitespace-nowrap">
                          <Badge className="w-3 h-3" />
                          Reserved
                        </span>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${getStatusColor(
                        charger.status
                      )}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${getStatusDot(charger.status)}`} />
                      {getStatusText(charger.status)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1.5 text-xs sm:text-sm text-gray-600">
                    <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">{charger.address}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                      <span>{charger.maxKW} kW</span>
                    </div>
                    <span className="text-gray-400">•</span>
                    <span>{charger.connectorType}</span>
                    <span className="text-gray-400">•</span>
                    <span className="font-medium">€{charger.kwhprice}/kWh</span>
                  </div>

                  {charger.providerName && (
                    <div className="mt-1 text-xs sm:text-sm text-gray-500 truncate">
                      Provider: {charger.providerName}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
