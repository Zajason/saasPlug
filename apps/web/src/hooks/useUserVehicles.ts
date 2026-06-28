// hooks/useUserVehicles.ts
import { useCallback, useEffect, useState } from "react";
import { fetchCarOwnerships, isLoggedIn, AuthError } from "../utils/api";
import type { CarOwnershipApi } from "../types/ownership";
import { ownershipToVehicle, type Vehicle } from "../utils/vehicleMapper";

export function useUserVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [notLoggedIn, setNotLoggedIn] = useState(false);
  const [hasNoCars, setHasNoCars] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNotLoggedIn(false);
      setHasNoCars(false);

      if (!isLoggedIn()) {
        setNotLoggedIn(true);
        setVehicles([]);
        return;
      }

      const ownerships = (await fetchCarOwnerships()) as CarOwnershipApi[];
      const mapped = ownerships.map(ownershipToVehicle);
      setVehicles(mapped);
      setHasNoCars(mapped.length === 0);
    } catch (e: any) {
      if (e instanceof AuthError || e?.name === "AuthError") {
        setNotLoggedIn(true);
        setVehicles([]);
        return;
      }

      setError(e?.message ?? "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  return { vehicles, loading, error, notLoggedIn, hasNoCars, refresh: loadVehicles };
}
