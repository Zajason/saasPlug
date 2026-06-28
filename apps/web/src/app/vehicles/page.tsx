"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Menu,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { SideMenu } from "../../components/SideMenu";
import { MenuPanel } from "../../components/MenuPanel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { cn } from "../../components/ui/utils";
import { useUserVehicles } from "../../hooks/useUserVehicles";
import {
  createCarOwnership,
  deleteCarOwnership,
  searchCars,
} from "../../utils/api";
import type { Vehicle } from "../../utils/vehicleMapper";
import type { CarApi } from "../../types/ownership";

const CAR_COLOR_OPTIONS = [
  { value: "RED", label: "Red", swatch: "#ef4444" },
  { value: "BLUE", label: "Blue", swatch: "#3b82f6" },
  { value: "YELLOW", label: "Yellow", swatch: "#eab308" },
  { value: "WHITE", label: "White", swatch: "#f9fafb" },
  { value: "BLACK", label: "Black", swatch: "#111827" },
  { value: "SILVER", label: "Silver", swatch: "#9ca3af" },
  { value: "GREY", label: "Grey", swatch: "#6b7280" },
  { value: "GREEN", label: "Green", swatch: "#22c55e" },
  { value: "ORANGE", label: "Orange", swatch: "#f97316" },
  { value: "PURPLE", label: "Purple", swatch: "#a855f7" },
] as const;

type CarColorValue = (typeof CAR_COLOR_OPTIONS)[number]["value"];

const MIN_SEARCH_QUERY = 2;
const SEARCH_DEBOUNCE_MS = 350;

const formatColorLabel = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

export default function VehiclesScreen() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CarApi[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarApi | null>(null);
  const [selectedColor, setSelectedColor] = useState<CarColorValue>("SILVER");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { vehicles, loading, error, hasNoCars, notLoggedIn, refresh } = useUserVehicles();

  useEffect(() => {
    if (!isAddDialogOpen) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < MIN_SEARCH_QUERY) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await searchCars(trimmed);
        setSearchResults(results);
      } catch (err: any) {
        setSearchError(err?.message ?? "Unable to search vehicles right now.");
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery, isAddDialogOpen]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!statusError) return;
    const timer = setTimeout(() => setStatusError(null), 5000);
    return () => clearTimeout(timer);
  }, [statusError]);

  const resetDialogState = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCar(null);
    setSelectedColor("SILVER");
    setDialogError(null);
    setSearchError(null);
    setSearching(false);
    setSaving(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      resetDialogState();
    }
  };

  const handleSelectCar = (car: CarApi) => {
    setSelectedCar(car);
    setSearchQuery(
      `${car.brand} ${car.model}${car.variant ? ` ${car.variant}` : ""}`.trim()
    );
  };

  const handleAddVehicle = async () => {
    if (!selectedCar) {
      setDialogError("Select a vehicle from the search results before saving.");
      return;
    }

    setDialogError(null);
    setSaving(true);

    try {
      await createCarOwnership(selectedCar.id, selectedColor);
      await refresh();
      setStatusMessage(`${selectedCar.brand} ${selectedCar.model} saved to your garage.`);
      handleDialogOpenChange(false);
    } catch (err: any) {
      setDialogError(err?.message ?? "Failed to save vehicle. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveVehicle = async (ownershipId: string) => {
    const numericId = Number(ownershipId);
    if (Number.isNaN(numericId)) {
      setStatusError("Unable to remove vehicle: invalid identifier.");
      return;
    }

    setRemovingId(ownershipId);
    setStatusError(null);
    setStatusMessage(null);

    try {
      await deleteCarOwnership(numericId);
      await refresh();
      setStatusMessage("Vehicle removed successfully.");
    } catch (err: any) {
      setStatusError(err?.message ?? "Failed to remove vehicle.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row h-screen w-full">
      <div className="sm:hidden flex items-center gap-3 p-3 bg-white border-b border-gray-200">
        <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-medium text-gray-900">Vehicles</h1>
      </div>
      <MenuPanel isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-4xl mx-auto p-6 sm:p-8 lg:p-12 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Vehicles</h1>
              <p className="text-sm text-gray-500">Manage the EVs linked to your account.</p>
            </div>
            <Button onClick={() => handleDialogOpenChange(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Vehicle
            </Button>
          </div>

          {statusError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          )}

          {statusMessage && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          )}

          {error && !statusError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unable to load vehicles</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="bg-white rounded-lg border border-dashed border-gray-200 p-12 text-center text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-3" />
              Loading your vehicles...
            </div>
          ) : notLoggedIn ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-600 mb-4">Sign in to view and manage your vehicles.</p>
              <Button asChild>
                <Link href="/signin">Go to Sign In</Link>
              </Button>
            </div>
          ) : hasNoCars ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <p className="text-gray-600 mb-4">You have not added any vehicles yet.</p>
              <Button onClick={() => handleDialogOpenChange(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first vehicle
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onRemove={handleRemoveVehicle}
                  removing={removingId === vehicle.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden sm:block sm:w-80 lg:w-96 flex-shrink-0">
        <SideMenu />
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a vehicle</DialogTitle>
            <DialogDescription>
              Search our catalogue and link the EV you actively drive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div>
              <Label htmlFor="vehicle-search">Search by brand or model</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="vehicle-search"
                  placeholder="e.g., Tesla Model 3"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Enter at least {MIN_SEARCH_QUERY} characters to search official EV specs.
              </p>
            </div>

            <div className="rounded-md border bg-white">
              {searchQuery.trim().length < MIN_SEARCH_QUERY ? (
                <p className="p-4 text-sm text-gray-500">
                  Keep typing to see matching vehicles.
                </p>
              ) : searching ? (
                <div className="flex items-center gap-2 p-4 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Searching catalogue...
                </div>
              ) : searchError ? (
                <p className="p-4 text-sm text-red-600">{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">No vehicles match that search.</p>
              ) : (
                <ScrollArea className="h-60">
                  <div className="divide-y">
                    {searchResults.map((car) => {
                      const isSelected = selectedCar?.id === car.id;
                      const peakKw = car.dcMaxKW ?? car.acMaxKW ?? 0;
                      return (
                        <button
                          key={car.id}
                          type="button"
                          onClick={() => handleSelectCar(car)}
                          className={cn(
                            "w-full px-4 py-3 text-left transition-colors",
                            isSelected ? "bg-emerald-700 text-white" : "hover:bg-gray-50"
                          )}
                        >
                          <p className={cn("font-medium", isSelected ? "text-white" : "text-gray-900")}>
                            {car.brand} {car.model}
                            {car.variant ? (
                              <span className={cn("ml-2 text-xs", isSelected ? "text-emerald-100" : "text-gray-500")}>{car.variant}</span>
                            ) : null}
                          </p>
                          <p className={cn("text-xs", isSelected ? "text-emerald-100" : "text-gray-500")}>
                            {car.usableBatteryKWh} kWh • up to {peakKw.toFixed(0)} kW
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {selectedCar ? (
              <div className="rounded-md border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                <p className="font-semibold">
                  {selectedCar.brand} {selectedCar.model}
                </p>
                <p>
                  {selectedCar.usableBatteryKWh} kWh battery •{" "}
                  {(selectedCar.dcMaxKW ?? selectedCar.acMaxKW ?? 0).toFixed(0)} kW max charge rate
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Select a vehicle above to continue.
              </p>
            )}

            <div>
              <Label htmlFor="color-select">Vehicle color</Label>
              <Select value={selectedColor} onValueChange={(value: CarColorValue) => setSelectedColor(value)}>
                <SelectTrigger id="color-select" className="mt-2">
                  <SelectValue placeholder="Choose a color" />
                </SelectTrigger>
                <SelectContent>
                  {CAR_COLOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-white/40 shadow"
                          style={{ backgroundColor: option.swatch }}
                        />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dialogError && <p className="text-sm text-red-600">{dialogError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAddVehicle} disabled={!selectedCar || saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> Save vehicle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface VehicleCardProps {
  vehicle: Vehicle;
  onRemove: (ownershipId: string) => void | Promise<void>;
  removing: boolean;
}

function VehicleCard({ vehicle, onRemove, removing }: VehicleCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {vehicle.brand} {vehicle.model}
          </h3>
          <p className="text-sm text-gray-500">Added in {vehicle.year}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRemove(vehicle.id)}
          disabled={removing}
          className="w-full sm:w-auto"
        >
          {removing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </>
          )}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Battery</p>
          <p className="text-base text-gray-900 font-medium">{vehicle.batteryCapacity} kWh</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Max charge speed</p>
          <p className="text-base text-gray-900 font-medium">{vehicle.maxChargingSpeed} kW</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Battery level</p>
          <p className="text-base text-gray-900 font-medium">{vehicle.currentBatteryLevel}%</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Color</p>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full border border-gray-200 shadow"
              style={{ backgroundColor: vehicle.color }}
            />
            <span className="text-base text-gray-900 font-medium">
              {formatColorLabel(vehicle.colorName)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
