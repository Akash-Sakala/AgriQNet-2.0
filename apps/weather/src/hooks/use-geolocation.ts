import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { Coordinates } from "@/api/types";

export type LocationSource = "url" | "gps" | "saved" | "default";

const SAVED_KEY = "agriqnet_weather_last_coords";
const DEFAULT: Coordinates = { lat: 12.9716, lon: 77.5946 }; // Bengaluru

function saved(): Coordinates | null {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED_KEY) || "null");
    return s && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? s : null;
  } catch {
    return null;
  }
}
const remember = (c: Coordinates) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

/**
 * Location for the weather station — never a dead end:
 *  1. ?lat&lon in the URL: the farmer's registered district (passed by the main app) or a place
 *     picked in the search box. Reacts to URL changes, so search updates the page in place.
 *  2. browser GPS (when the farmer taps "Use my GPS" and the browser allows it)
 *  3. last location used on this device
 *  4. Bengaluru
 */
export function useGeolocation() {
  const [params, setParams] = useSearchParams();
  const lat = parseFloat(params.get("lat") || "");
  const lon = parseFloat(params.get("lon") || "");
  const urlCoords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

  const [gps, setGps] = useState<Coordinates | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [fallback, setFallback] = useState<{ coords: Coordinates; source: LocationSource } | null>(null);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) { setGpsDenied(true); return; }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        remember(c);
        setGps(c);
        setGpsDenied(false);
        setGpsBusy(false);
        // GPS wins over the district / searched place: drop them from the URL (keep the language)
        setParams((p) => { const n = new URLSearchParams(); if (p.get("lang")) n.set("lang", p.get("lang")!); return n; }, { replace: true });
      },
      () => { setGpsDenied(true); setGpsBusy(false); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  }, [setParams]);

  // No location given at all: try GPS once, meanwhile show the last place (or Bengaluru).
  useEffect(() => {
    if (urlCoords || gps) return;
    const s = saved();
    setFallback({ coords: s || DEFAULT, source: s ? "saved" : "default" });
    getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (urlCoords) remember(urlCoords); }, [urlCoords?.lat, urlCoords?.lon]);

  const coordinates = urlCoords || gps || fallback?.coords || null;
  const source: LocationSource | null = urlCoords ? "url" : gps ? "gps" : fallback?.source || null;
  return {
    coordinates,
    source,
    place: urlCoords ? params.get("place") : null,
    gpsDenied,
    gpsBusy,
    isLoading: !coordinates,
    error: gpsDenied ? "denied" : null,
    getLocation,
  };
}
