"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  MapPin,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle,
  DollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { fetchCharger, fetchPaymentMethods, isLoggedIn } from "../utils/api";
import type { Charger } from "../types/charger";
import { CartoonCar } from "./ui/CartoonCar";

import { useUserVehicles } from "../hooks/useUserVehicles";
import type { Vehicle } from "../utils/vehicleMapper";

interface ChargingStatusData {
  kWh: number;
  costSoFar: number;
  elapsedSeconds: number;
  maxKW: number;
  maxKWh?: number | null;
  pricePerKWh: number;
  status: string;
}

interface ChargerDetailsProps {
  charger: Charger;
  onClose: () => void;

  // reservation actions
  onReserve: (chargerId: string, minutes?: number) => void;
  onCancel: (chargerId: string) => void;

  // reservation state from parent
  isReserved: boolean;
  isReserving: boolean;
  hasActiveReservation: boolean;

  // error state from parent
  error: string | null;
  onErrorClose: () => void;

  // timer related (teammate version)
  lastReservationDuration: number; // seconds
  lastReservationStartTime: number | null; // ms epoch

  // charging session state
  activeReservationId?: number | null;
  activeSessionId?: number | null;
  chargingStatus?: ChargingStatusData | null;
  onStartCharging?: (
    reservationId: number,
    battery?: { batteryCapacityKWh: number; currentBatteryLevel: number }
  ) => void;
  onStopCharging?: (sessionId: number) => void;

  // cluster navigation
  clusterIndex?: number | null;
  clusterCount?: number | null;
  onPrevCharger?: () => void;
  onNextCharger?: () => void;
}

export function ChargerDetails({
  charger,
  onClose,
  onReserve,
  onCancel,
  isReserved,
  isReserving,
  hasActiveReservation,
  error,
  onErrorClose,
  lastReservationDuration,
  lastReservationStartTime,

  // charging
  activeReservationId = null,
  activeSessionId = null,
  chargingStatus = null,
  onStartCharging,
  onStopCharging,

  // cluster nav
  clusterIndex = null,
  clusterCount = null,
  onPrevCharger,
  onNextCharger,
}: ChargerDetailsProps) {
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState(0);

  const {
    vehicles,
    loading: vehiclesLoading,
    error: vehiclesError,
    notLoggedIn,
    hasNoCars,
  } = useUserVehicles();

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!selectedVehicle && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    }
  }, [vehicles, selectedVehicle]);

  // Timer logic - calculate remaining time based on start time from parent
  useEffect(() => {
    if (
      isReserved &&
      lastReservationStartTime !== null &&
      lastReservationDuration > 0
    ) {
      const interval = setInterval(() => {
        const elapsed = (Date.now() - lastReservationStartTime) / 1000;
        const remaining = Math.max(0, lastReservationDuration - elapsed);
        setTimeRemaining(remaining);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isReserved, lastReservationStartTime, lastReservationDuration]);

  // Reset timer when reservation is cancelled or charger changes
  useEffect(() => {
    if (!isReserved) setTimeRemaining(0);
  }, [isReserved, charger.id]);

  const formatTime = (seconds: number) => {
    const rounded = Math.max(0, Math.round(seconds));
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const connectorLabel = (t?: Charger["connectorType"]) => {
    switch (t) {
      case "CCS":
        return "CCS";
      case "CHADEMO":
        return "CHAdeMO";
      case "TYPE2":
        return "Type 2";
      default:
        return t ?? "Unknown";
    }
  };

  const getStatusColor = () => {
    switch (charger.status) {
      case "available":
        return "text-blue-600 bg-blue-50";
      case "in_use":
        return "text-orange-600 bg-orange-50";
      case "outage":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusIcon = () => {
    switch (charger.status) {
      case "available":
        return <CheckCircle className="w-5 h-5" />;
      case "in_use":
        return <Clock className="w-5 h-5" />;
      case "outage":
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getStatusText = () => {
    switch (charger.status) {
      case "available":
        return "Available";
      case "in_use":
        return "In Use";
      case "outage":
        return "Out of Service";
      default:
        return "Unknown";
    }
  };

  const contentProps = {
    charger,
    timeRemaining,
    formatTime,
    getStatusColor,
    getStatusIcon,
    getStatusText,
    connectorLabel,
    onReserve,
    onCancel,
    isReserved,
    isReserving,
    hasActiveReservation,
    error,
    onErrorClose,
    vehicles,
    vehiclesLoading,
    vehiclesError,
    notLoggedIn,
    hasNoCars,
    selectedVehicle,
    setSelectedVehicle,
    goToProfile: () => router.push("/profile"),
    goToSignIn: () => router.push("/signin"),
    goToBilling: () => router.push("/billing"),
    activeReservationId,
    activeSessionId,
    chargingStatus,
    onStartCharging,
    onStopCharging,
  };

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-[1000] max-h-[75vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <Header
            title={charger.name ?? "Charger"}
            onClose={onClose}
            clusterIndex={clusterIndex}
            clusterCount={clusterCount}
            onPrev={onPrevCharger}
            onNext={onNextCharger}
          />
          <ChargerContent {...contentProps} />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block absolute top-4 left-4 bg-white rounded-lg shadow-2xl z-[1000] w-96 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="p-6">
          <Header
            title={charger.name ?? "Charger"}
            onClose={onClose}
            clusterIndex={clusterIndex}
            clusterCount={clusterCount}
            onPrev={onPrevCharger}
            onNext={onNextCharger}
          />
          <ChargerContent {...contentProps} />
        </div>
      </div>
    </>
  );
}

function Header({
  title,
  onClose,
  clusterIndex,
  clusterCount,
  onPrev,
  onNext,
}: {
  title: string;
  onClose: () => void;
  clusterIndex?: number | null;
  clusterCount?: number | null;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const inCluster =
    typeof clusterIndex === "number" &&
    typeof clusterCount === "number" &&
    clusterCount > 1;

  return (
    <div className="flex justify-between items-start mb-4 gap-3">
      <div className="min-w-0">
        <h2 className="text-xl truncate">{title}</h2>

        {inCluster && (
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span>
              Charger {clusterIndex! + 1} of {clusterCount}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {inCluster && (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Previous charger"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Next charger"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

interface ChargerContentProps {
  charger: Charger;
  timeRemaining: number;
  formatTime: (seconds: number) => string;
  getStatusColor: () => string;
  getStatusIcon: () => React.JSX.Element;
  getStatusText: () => string;
  connectorLabel: (t?: Charger["connectorType"]) => string;
  onReserve: (chargerId: string, minutes?: number) => void;
  onCancel: (chargerId: string) => void;
  isReserved: boolean;
  isReserving: boolean;
  hasActiveReservation: boolean;
  error: string | null;
  onErrorClose: () => void;
  vehicles: Vehicle[];
  vehiclesLoading: boolean;
  vehiclesError: string | null;
  notLoggedIn: boolean;
  hasNoCars: boolean;
  selectedVehicle: Vehicle | null;
  setSelectedVehicle: (v: Vehicle | null) => void;
  goToProfile: () => void;
  goToSignIn: () => void;
  goToBilling: () => void;
  activeReservationId?: number | null;
  activeSessionId?: number | null;
  chargingStatus?: ChargingStatusData | null;
  onStartCharging?: (
    reservationId: number,
    battery?: { batteryCapacityKWh: number; currentBatteryLevel: number }
  ) => void;
  onStopCharging?: (sessionId: number) => void;
}

function ChargerContent({
  charger,
  timeRemaining,
  formatTime,
  getStatusColor,
  getStatusIcon,
  getStatusText,
  connectorLabel,
  onReserve,
  onCancel,
  isReserved,
  isReserving,
  hasActiveReservation,
  error,
  onErrorClose,
  vehicles,
  vehiclesLoading,
  vehiclesError,
  notLoggedIn,
  hasNoCars,
  selectedVehicle,
  setSelectedVehicle,
  goToProfile,
  goToSignIn,
  goToBilling,
  activeReservationId,
  activeSessionId,
  chargingStatus,
  onStartCharging,
  onStopCharging,
}: ChargerContentProps) {
  const [showVehicleMenu, setShowVehicleMenu] = useState(false);
  const [showCardMenu, setShowCardMenu] = useState(false);
  const [paymentCards, setPaymentCards] = useState<
    { id: number; provider: string; tokenLast4: string; status: string }[]
  >([]);
  const [selectedCard, setSelectedCard] = useState<{
    id: number;
    provider: string;
    tokenLast4: string;
    status: string;
  } | null>(null);
  const [cardsLoading, setCardsLoading] = useState(false);

  const price = typeof charger.kwhprice === "number" ? charger.kwhprice : 0;

  const [reservationEndTime, setReservationEndTime] = useState<string | null>(
    null
  );
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);

  const isGuest = notLoggedIn || !isLoggedIn();
  const reservationSupported = charger.reservationSupported !== false;
  const reserveDisabled = !reservationSupported || isGuest || isReserved || isReserving || hasActiveReservation;
  const errorNeedsBilling =
    typeof error === "string" && /payment method|card|billing/i.test(error);

  // ---------------------------
  // Distance / ETA additions
  // ---------------------------
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceText: string; durationText: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Get current location if user allows it
  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setUserLoc(null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  // Fetch distance+ETA for this charger when we have user location
  useEffect(() => {
    if (!userLoc) {
      setRouteInfo(null);
      return;
    }

    let mounted = true;
    setRouteLoading(true);

    const qs = new URLSearchParams({
      oLat: String(userLoc.lat),
      oLng: String(userLoc.lng),
      dLat: String(charger.lat),
      dLng: String(charger.lng),
    });

    fetch(`/api/route-info?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`route-info failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        if (data?.distanceText && data?.durationText) {
          setRouteInfo({ distanceText: data.distanceText, durationText: data.durationText });
        } else {
          setRouteInfo(null);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setRouteInfo(null);
      })
      .finally(() => {
        if (!mounted) return;
        setRouteLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userLoc, charger.id, charger.lat, charger.lng]);
  // ---------------------------

  useEffect(() => {
    setShowVehicleMenu(false);
  }, [selectedVehicle?.id, vehicles.length]);

  // Load payment cards when duration picker opens
  useEffect(() => {
    if (!showDurationPicker || isGuest) return;
    let mounted = true;
    setCardsLoading(true);
    fetchPaymentMethods()
      .then((methods: any[]) => {
        if (!mounted) return;
        const valid = methods.filter((m: any) => m.status === "valid");
        setPaymentCards(valid);
        if (valid.length > 0 && !selectedCard) setSelectedCard(valid[0]);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setCardsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showDurationPicker, isGuest]);

  useEffect(() => {
    let mounted = true;

    async function loadDetails() {
      try {
        const data = await fetchCharger(String(charger.id));
        if (mounted && data?.reservationendtime)
          setReservationEndTime(String(data.reservationendtime));
        else if (mounted) setReservationEndTime(null);
      } catch {
        // ignore
      }
    }

    loadDetails();
    return () => {
      mounted = false;
    };
  }, [charger.id]);

  const chargerPowerKW = charger.maxKW ?? 0;
  const pricePerKwh = typeof charger.kwhprice === "number" ? charger.kwhprice : 0;

  const estimates = useMemo(() => {
    if (!selectedVehicle || chargerPowerKW <= 0) return null;

    const target = 80;
    const energyNeeded =
      (selectedVehicle.batteryCapacity * (target - selectedVehicle.currentBatteryLevel)) /
      100;

    const speed = Math.min(chargerPowerKW, selectedVehicle.maxChargingSpeed);
    const timeMinutes = Math.max(0, Math.round((energyNeeded / speed) * 60));
    const cost = energyNeeded * pricePerKwh;

    return {
      timeMinutes,
      cost: cost.toFixed(2),
      energyNeeded: energyNeeded.toFixed(1),
      target,
    };
  }, [selectedVehicle, chargerPowerKW, pricePerKwh]);

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full ${getStatusColor()}`}>
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </div>

      {charger.status === "available" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 space-y-3">
          {vehiclesLoading && <p className="text-sm text-gray-600">Loading your cars…</p>}

          {!vehiclesLoading && notLoggedIn && (
            <>
              <p className="text-sm text-gray-700">Sign in to see charging estimates.</p>
              <button
                type="button"
                onClick={goToSignIn}
                className="w-full py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Go to Profile / Sign in
              </button>
            </>
          )}

          {!vehiclesLoading && !notLoggedIn && hasNoCars && (
            <>
              <p className="text-sm text-gray-700">You haven’t linked a car yet.</p>
              <button
                type="button"
                onClick={goToProfile}
                className="w-full py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Add a car
              </button>
            </>
          )}

          {!vehiclesLoading && !notLoggedIn && !hasNoCars && vehiclesError && (
            <p className="text-sm text-red-600">Failed to load cars: {vehiclesError}</p>
          )}

          {!vehiclesLoading && !notLoggedIn && !hasNoCars && !vehiclesError && (
            <>
              {!selectedVehicle ? (
                <p className="text-sm text-gray-700">Selecting your car…</p>
              ) : (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (vehicles.length > 1) setShowVehicleMenu((v) => !v);
                      }}
                      className={`w-full flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
                        vehicles.length > 1
                          ? "hover:bg-white/60 cursor-pointer"
                          : "cursor-default"
                      } transition-colors`}
                      aria-haspopup={vehicles.length > 1 ? "listbox" : undefined}
                      aria-expanded={vehicles.length > 1 ? showVehicleMenu : undefined}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CartoonCar color={selectedVehicle.color} className="w-14 h-14 shrink-0" />
                        <div className="min-w-0 text-left">
                          <p className="text-gray-900 font-medium truncate">
                            {selectedVehicle.brand} {selectedVehicle.model}
                            {selectedVehicle.year ? ` (${selectedVehicle.year})` : ""}
                          </p>
                          <p className="text-sm text-gray-500">
                            Battery: {selectedVehicle.currentBatteryLevel}%
                          </p>
                        </div>
                      </div>

                      {vehicles.length > 1 ? (
                        <ChevronDown
                          className={`w-5 h-5 text-gray-500 shrink-0 transition-transform ${
                            showVehicleMenu ? "rotate-180" : ""
                          }`}
                        />
                      ) : null}
                    </button>

                    {vehicles.length > 1 && showVehicleMenu && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowVehicleMenu(false)}
                          className="fixed inset-0 z-0 cursor-default"
                          aria-label="Close vehicle menu"
                        />
                        <div
                          role="listbox"
                          className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto"
                        >
                          {vehicles.map((vehicle) => {
                            const active = vehicle.id === selectedVehicle.id;
                            return (
                              <button
                                type="button"
                                key={vehicle.id}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setSelectedVehicle(vehicle);
                                  setShowVehicleMenu(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                                  active ? "bg-blue-50" : "hover:bg-gray-50"
                                }`}
                              >
                                <div
                                  className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                                  style={{ backgroundColor: vehicle.color }}
                                />
                                <div className="min-w-0">
                                  <p className="text-gray-900 truncate">
                                    {vehicle.brand} {vehicle.model}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {estimates && (
                    <div className="space-y-2 pt-2 border-t">
                      <Row icon={<Clock className="w-4 h-4" />} label="Estimated Time" value={`${estimates.timeMinutes} min`} />
                      <Row icon={<DollarSign className="w-4 h-4" />} label="Estimated Cost" value={`€${estimates.cost}`} />
                      <Row icon={<Zap className="w-4 h-4" />} label={`To ${estimates.target}%`} value={`${estimates.energyNeeded} kWh`} />
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <InfoRow icon={<MapPin className="w-5 h-5 text-gray-400" />} text={charger.address || "No address provided"} />

      <InfoRow
        icon={<Zap className="w-5 h-5 text-gray-400" />}
        text={`${chargerPowerKW} kW • ${connectorLabel(charger.connectorType)}`}
      />

      {/* Distance + ETA (only if location is allowed) */}
      {userLoc && (
        <InfoRow
          icon={<Clock className="w-5 h-5 text-gray-400" />}
          text={
            routeLoading
              ? "Calculating distance & ETA…"
              : routeInfo
              ? `${routeInfo.distanceText} away • ~${routeInfo.durationText} drive`
              : "Distance/ETA unavailable"
          }
        />
      )}

      {/* Active charging session display */}
      {activeSessionId && chargingStatus && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            {chargingStatus.status === "AUTO_STOPPED" ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-green-900 font-medium">Battery Full — Charging Complete</p>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <p className="text-green-900 font-medium">Charging in Progress</p>
              </>
            )}
          </div>

          {chargingStatus.maxKWh && chargingStatus.maxKWh > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{chargingStatus.kWh.toFixed(1)} kWh</span>
                <span>{chargingStatus.maxKWh.toFixed(1)} kWh</span>
              </div>
              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (chargingStatus.kWh / chargingStatus.maxKWh) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-gray-500">Energy</p>
              <p className="text-2xl font-semibold text-gray-900">
                {chargingStatus.kWh.toFixed(2)}{" "}
                <span className="text-sm font-normal">kWh</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Cost</p>
              <p className="text-2xl font-semibold text-gray-900">
                &euro;{Math.max(chargingStatus.costSoFar, 3).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Elapsed</p>
              <p className="text-lg text-gray-900">
                {formatTime(chargingStatus.elapsedSeconds)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Power</p>
              <p className="text-lg text-gray-900">{chargingStatus.maxKW} kW</p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Min. charge: &euro;3.00 &bull; &euro;{chargingStatus.pricePerKWh.toFixed(2)}/kWh
          </p>

          {chargingStatus.status === "AUTO_STOPPED" ? (
            <p className="text-center text-sm text-green-700 font-medium">
              Charging complete — payment processed
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onStopCharging?.(activeSessionId)}
              className="w-full py-3 rounded-lg bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors font-medium"
            >
              Stop Charging
            </button>
          )}
        </div>
      )}

      {/* Reserved state with timer and start button */}
      {isReserved && !activeSessionId && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-orange-900 mb-1">Reservation Time Remaining</p>
            <p className="text-3xl text-orange-600">{formatTime(timeRemaining)}</p>
          </div>
          {activeReservationId && onStartCharging && (
            <button
              type="button"
              onClick={() =>
                onStartCharging(
                  activeReservationId,
                  selectedVehicle
                    ? {
                        batteryCapacityKWh: selectedVehicle.batteryCapacity,
                        currentBatteryLevel: selectedVehicle.currentBatteryLevel,
                      }
                    : undefined
                )
              }
              className="w-full py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              Start Charging
            </button>
          )}
        </div>
      )}

      {hasActiveReservation && !isReserved && !activeSessionId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-yellow-900">You already have an active reservation</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <span className="text-red-900 text-sm block">{error}</span>
                {errorNeedsBilling ? (
                  <button
                    type="button"
                    onClick={goToBilling}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                  >
                    <CreditCard className="h-4 w-4" />
                    Go to Billing
                  </button>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onErrorClose}
              className="text-red-600 hover:text-red-800 ml-2"
              aria-label="Close error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {(charger.status === "available" || isReserved) && !activeSessionId && (
        <div className="space-y-2">
          {!reservationSupported && !isReserved ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              This provider does not support charger reservations through its API.
            </div>
          ) : null}

          {reservationSupported && isGuest && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
              <p>Sign in to reserve chargers.</p>
              <button
                type="button"
                onClick={goToSignIn}
                className="mt-2 w-full py-2 rounded-md border border-blue-600 text-blue-700 hover:bg-blue-50"
              >
                Go to Sign in
              </button>
            </div>
          )}

          {reservationSupported || isReserved ? (
            <button
              type="button"
              onClick={() => setShowDurationPicker(true)}
              disabled={reserveDisabled}
              className={`w-full py-3 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                isReserved
                  ? "bg-green-500 text-white cursor-default"
                  : reserveDisabled
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {isReserving && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isReserved
                ? "Reserved!"
                : isReserving
                ? "Reserving..."
                : hasActiveReservation
                ? "Cannot Reserve"
                : isGuest
                ? "Sign in to reserve"
                : "Reserve Charger"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() =>
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lng}`,
                "_blank"
              )
            }
            className="w-full py-3 border rounded-lg flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Navigate
          </button>
        </div>
      )}

      {isReserved && !activeSessionId && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (!confirm("Cancel your reservation? The €3 hold will be released.")) return;
              onCancel(charger.id);
            }}
            className="w-full py-2 rounded-md bg-red-600 text-white"
          >
            Cancel Reservation
          </button>
        </div>
      )}

      {showDurationPicker && reservationSupported && (
        <>
          {/* Mobile */}
          <div className="md:hidden fixed inset-0 z-[1200] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowDurationPicker(false)}
            />
            <div className="relative bg-white rounded-xl p-4 w-[92%] max-w-md shadow-2xl ring-1 ring-gray-100 border border-gray-200">
              <h3 className="text-lg font-medium mb-3">Reserve & Pay</h3>

              {/* Card selector */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Payment card</label>
                {cardsLoading ? (
                  <div className="text-sm text-gray-500 py-2">Loading cards...</div>
                ) : paymentCards.length === 0 ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-sm text-red-700">No saved cards. Add one in Billing first.</div>
                    <button
                      type="button"
                      onClick={goToBilling}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                    >
                      <CreditCard className="h-4 w-4" />
                      Go to Billing
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (paymentCards.length > 1) setShowCardMenu((v) => !v);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 py-2.5 ${
                        paymentCards.length > 1 ? "hover:border-gray-400 cursor-pointer" : "cursor-default"
                      } transition-colors`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CreditCard className="w-5 h-5 text-gray-500 shrink-0" />
                        <span className="text-sm text-gray-900 truncate">
                          {selectedCard ? `${selectedCard.provider} •••• ${selectedCard.tokenLast4}` : "Select a card"}
                        </span>
                      </div>
                      {paymentCards.length > 1 && (
                        <ChevronDown
                          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                            showCardMenu ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>

                    {showCardMenu && paymentCards.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowCardMenu(false)}
                          className="fixed inset-0 z-0 cursor-default"
                          aria-label="Close"
                        />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                          {paymentCards.map((card) => (
                            <button
                              type="button"
                              key={card.id}
                              onClick={() => {
                                setSelectedCard(card);
                                setShowCardMenu(false);
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                                card.id === selectedCard?.id ? "bg-blue-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <CreditCard className="w-4 h-4 text-gray-500 shrink-0" />
                              <span className="text-gray-900">
                                {card.provider} •••• {card.tokenLast4}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Duration slider */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Duration</label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={10}
                  value={selectedMinutes}
                  onChange={(e) => setSelectedMinutes(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm text-gray-600 mt-1">{selectedMinutes} minutes</div>
              </div>

              {/* Cost info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-3 text-sm text-blue-900">
                A <strong>€3.00</strong> hold will be placed on your card. Final cost is based on usage.
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-gray-100"
                  onClick={() => setShowDurationPicker(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedCard}
                  className={`px-3 py-2 rounded text-white ${
                    selectedCard ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    setShowDurationPicker(false);
                    onReserve(charger.id, selectedMinutes);
                  }}
                >
                  Reserve & Pay ({selectedMinutes}m)
                </button>
              </div>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden md:block absolute left-4 top-28 z-[1300]">
            <div className="bg-white rounded-xl p-4 w-80 shadow-2xl ring-1 ring-gray-100 border border-gray-200">
              <h3 className="text-lg font-medium mb-3">Reserve & Pay</h3>

              {/* Card selector */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Payment card</label>
                {cardsLoading ? (
                  <div className="text-sm text-gray-500 py-2">Loading cards...</div>
                ) : paymentCards.length === 0 ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-sm text-red-700">No saved cards. Add one in Billing first.</div>
                    <button
                      type="button"
                      onClick={goToBilling}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                    >
                      <CreditCard className="h-4 w-4" />
                      Go to Billing
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (paymentCards.length > 1) setShowCardMenu((v) => !v);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 px-3 py-2.5 ${
                        paymentCards.length > 1 ? "hover:border-gray-400 cursor-pointer" : "cursor-default"
                      } transition-colors`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CreditCard className="w-5 h-5 text-gray-500 shrink-0" />
                        <span className="text-sm text-gray-900 truncate">
                          {selectedCard ? `${selectedCard.provider} •••• ${selectedCard.tokenLast4}` : "Select a card"}
                        </span>
                      </div>
                      {paymentCards.length > 1 && (
                        <ChevronDown
                          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${
                            showCardMenu ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>

                    {showCardMenu && paymentCards.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowCardMenu(false)}
                          className="fixed inset-0 z-0 cursor-default"
                          aria-label="Close"
                        />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                          {paymentCards.map((card) => (
                            <button
                              type="button"
                              key={card.id}
                              onClick={() => {
                                setSelectedCard(card);
                                setShowCardMenu(false);
                              }}
                              className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                                card.id === selectedCard?.id ? "bg-blue-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <CreditCard className="w-4 h-4 text-gray-500 shrink-0" />
                              <span className="text-gray-900">
                                {card.provider} •••• {card.tokenLast4}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Duration slider */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Duration</label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={10}
                  value={selectedMinutes}
                  onChange={(e) => setSelectedMinutes(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm text-gray-600 mt-1">{selectedMinutes} minutes</div>
              </div>

              {/* Cost info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-3 text-sm text-blue-900">
                A <strong>€3.00</strong> hold will be placed on your card. Final cost is based on usage.
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-gray-100"
                  onClick={() => setShowDurationPicker(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedCard}
                  className={`px-3 py-2 rounded text-white ${
                    selectedCard ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
                  }`}
                  onClick={() => {
                    setShowDurationPicker(false);
                    onReserve(charger.id, selectedMinutes);
                  }}
                >
                  Reserve & Pay ({selectedMinutes}m)
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {isReserved && reservationEndTime && !activeSessionId && (
        <div className="text-sm text-gray-600">Reservation ends: {reservationEndTime}</div>
      )}

      <div className="pt-4 border-t">
        <p className="text-sm text-gray-500">Pricing</p>
        <p className="text-gray-900">€{pricePerKwh.toFixed(2)}/kWh</p>
      </div>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <p className="text-gray-700">{text}</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-gray-600">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
