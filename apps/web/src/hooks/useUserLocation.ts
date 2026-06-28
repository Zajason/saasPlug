"use client";

import { useEffect, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

export function useUserLocation(options?: PositionOptions) {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      setLoading(false);
      return;
    }

    const merged: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 1000, // allow 1s cached position
      timeout: 15000,
      ...options,
    };

    // Start continuous tracking
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy ?? null);
        setHeading(pos.coords.heading ?? null);
        setSpeed(pos.coords.speed ?? null);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to get location.");
        setLoading(false);
      },
      merged
    );

    // Cleanup: stop watching when component unmounts
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [options]);

  return { location, accuracy, heading, speed, error, loading };
}
