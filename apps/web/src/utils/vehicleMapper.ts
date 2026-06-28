// utils/vehicleMapper.ts
import type { CarOwnershipApi } from "../types/ownership";

export type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;                 // hex for CartoonCar
  colorName: string;
  batteryCapacity: number;        // kWh
  maxChargingSpeed: number;       // kW
  currentBatteryLevel: number;    // %
};

const COLOR_MAP: Record<string, string> = {
  RED: "#ef4444",
  BLUE: "#3b82f6",
  BLACK: "#111827",
  WHITE: "#f9fafb",
  SILVER: "#9ca3af",
  GRAY: "#6b7280",
  GREY: "#6b7280",
  GREEN: "#22c55e",
  YELLOW: "#eab308",
  ORANGE: "#f97316",
  PURPLE: "#a855f7",
  BROWN: "#92400e",
};

export function ownershipToVehicle(o: CarOwnershipApi): Vehicle {
  const car = o.car;

  return {
    id: String(o.id), // ownership id is fine; or `${o.carId}-${o.id}`
    brand: car.brand,
    model: car.model + (car.variant ? ` ${car.variant}` : ""),
    year: new Date(o.createdAt).getFullYear(), // fallback; or store year in DB later
    color: COLOR_MAP[o.color] ?? "#9ca3af",
    colorName: o.color,
    batteryCapacity: car.usableBatteryKWh,
    maxChargingSpeed: car.dcMaxKW ?? car.acMaxKW ?? 50,
    currentBatteryLevel: 30, // TODO: replace when you store actual SoC
  };
}
