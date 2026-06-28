import { X } from "lucide-react";
import type { Charger } from "../types/charger";

// ✅ Use the same status type as your backend model
type ChargerStatus = Charger["status"];

// ✅ Connector types (match your Prisma enum exactly)
export type ConnectorType = "CCS" | "CHADEMO" | "TYPE2" | "TYPE1" | "SCHUKO";

export type Filters = {
  status: Set<ChargerStatus>;
  connectorType: Set<ConnectorType>;
  minPower: number | null;
};

interface FilterMenuProps {
  isOpen: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

const CONNECTOR_TYPES: ConnectorType[] = ["CCS", "CHADEMO", "TYPE2", "TYPE1", "SCHUKO"];

function connectorLabel(t: ConnectorType) {
  // optional: nicer display names (keep logic values unchanged)
  switch (t) {
    case "TYPE1":
      return "Type 1";
    case "TYPE2":
      return "Type 2";
    case "SCHUKO":
      return "Schuko";
    default:
      return t; // CCS, CHADEMO
  }
}

export function FilterMenu({ isOpen, onClose, filters, onFiltersChange }: FilterMenuProps) {
  const toggleStatus = (status: ChargerStatus) => {
    const newStatus = new Set(filters.status);
    if (newStatus.has(status)) newStatus.delete(status);
    else newStatus.add(status);
    onFiltersChange({ ...filters, status: newStatus });
  };

  const toggleConnectorType = (type: ConnectorType) => {
    const newTypes = new Set(filters.connectorType);
    if (newTypes.has(type)) newTypes.delete(type);
    else newTypes.add(type);
    onFiltersChange({ ...filters, connectorType: newTypes });
  };

  const setPowerFilter = (power: number | null) => {
    onFiltersChange({ ...filters, minPower: power });
  };

  const clearFilters = () => {
    onFiltersChange({
      status: new Set<ChargerStatus>(["available", "in_use", "outage"]),
      connectorType: new Set<ConnectorType>(),
      minPower: null,
    });
  };

  const activeFilterCount =
    (filters.status.size < 3 ? 3 - filters.status.size : 0) +
    filters.connectorType.size +
    (filters.minPower !== null ? 1 : 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-[1001] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Filter Menu */}
      <div
        className={`fixed top-14 right-3 sm:top-16 sm:right-4 lg:top-20 lg:right-6 bg-white rounded-lg shadow-2xl z-[1002] w-[calc(100vw-24px)] max-w-[320px] transition-all duration-300 ${
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Filters</h3>
            {activeFilterCount > 0 && (
              <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close filters"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filter Content */}
        <div className="p-4 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Availability Filter */}
          <div>
            <h4 className="text-sm font-medium mb-3">Availability</h4>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.status.has("available") ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="checkbox"
                  checked={filters.status.has("available")}
                  onChange={() => toggleStatus("available")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">Available</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.status.has("in_use") ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="checkbox"
                  checked={filters.status.has("in_use")}
                  onChange={() => toggleStatus("in_use")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">In Use</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.status.has("outage") ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="checkbox"
                  checked={filters.status.has("outage")}
                  onChange={() => toggleStatus("outage")}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">Outage</span>
              </label>
            </div>
          </div>

          {/* Connector Type Filter */}
          <div>
            <h4 className="text-sm font-medium mb-3">Connector Type</h4>
            <div className="space-y-2">
              {CONNECTOR_TYPES.map((t) => (
                <label key={t} className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.connectorType.has(t) ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                  <input
                    type="checkbox"
                    checked={filters.connectorType.has(t)}
                    onChange={() => toggleConnectorType(t)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm">{connectorLabel(t)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Power Filter */}
          <div>
            <h4 className="text-sm font-medium mb-3">Minimum Power</h4>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.minPower === null ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="radio"
                  name="power"
                  checked={filters.minPower === null}
                  onChange={() => setPowerFilter(null)}
                  className="w-4 h-4 border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">Any</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.minPower === 50 ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="radio"
                  name="power"
                  checked={filters.minPower === 50}
                  onChange={() => setPowerFilter(50)}
                  className="w-4 h-4 border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">50 kW+</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.minPower === 100 ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="radio"
                  name="power"
                  checked={filters.minPower === 100}
                  onChange={() => setPowerFilter(100)}
                  className="w-4 h-4 border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">100 kW+</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.minPower === 150 ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="radio"
                  name="power"
                  checked={filters.minPower === 150}
                  onChange={() => setPowerFilter(150)}
                  className="w-4 h-4 border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">150 kW+</span>
              </label>

              <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${filters.minPower === 250 ? "border-blue-700 bg-blue-700 text-white" : "border-transparent hover:bg-gray-100"}`}>
                <input
                  type="radio"
                  name="power"
                  checked={filters.minPower === 250}
                  onChange={() => setPowerFilter(250)}
                  className="w-4 h-4 border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">250 kW+</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t">
          <button
            onClick={clearFilters}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
          >
            Clear All Filters
          </button>
        </div>
      </div>
    </>
  );
}
