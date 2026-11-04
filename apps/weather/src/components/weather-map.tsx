import { Search, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { weatherAPI } from "@/api/weather";
import type { Coordinates, GeocodingResponse } from "@/api/types";
import { t, placeName } from "@/i18n";

// Bundled marker images (no CDN needed)
const markerIcon = new L.Icon({ iconUrl: markerIconUrl, shadowUrl: markerShadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });

// OpenWeather 1.0 tile layers are included in the free plan
// (the previous "maps/2.0" layers need a paid plan and returned HTTP 401).
const LAYERS = [
  { id: "precipitation_new", key: "layerRain" },
  { id: "temp_new", key: "layerTemp" },
  { id: "clouds_new", key: "layerClouds" },
] as const;

function FlyTo({ lat, lon }: Coordinates) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], 8, { duration: 1.2 });
  }, [lat, lon, map]);
  return null;
}

export function WeatherMap({ center }: { center: Coordinates }) {
  const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResponse[]>([]);
  const [loc, setLoc] = useState<Coordinates | null>(null);
  const [layer, setLayer] = useState<(typeof LAYERS)[number]["id"]>("precipitation_new");

  async function searchPlace() {
    if (!query.trim()) return;
    const r = await weatherAPI.searchLocations(query);
    setResults(r);
    if (r.length) setLoc({ lat: r[0].lat, lon: r[0].lon });
  }

  const point = loc ?? center;

  return (
    <div className="p-4 bg-emerald-950/40 border border-emerald-600 rounded-xl mt-2">
      <div className="flex flex-wrap gap-2 mb-3">
        <input
          value={query}
          placeholder={t("searchCities")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchPlace()}
          className="px-3 py-2 rounded-lg bg-emerald-800 text-white placeholder:text-emerald-200/70 flex-1 min-w-[160px]"
        />
        <button onClick={searchPlace} className="bg-lime-400 px-4 py-2 rounded-lg text-black font-bold" aria-label={t("searchCities")}><Search className="h-4 w-4" /></button>
        <button onClick={() => setLoc(null)} className="bg-emerald-700 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {t("myLocation")}</button>
        <div className="flex rounded-lg overflow-hidden border border-emerald-600" role="group" aria-label={t("layer")}>
          {LAYERS.map((l) => (
            <button key={l.id} onClick={() => setLayer(l.id)}
              className={`px-3 py-2 text-sm ${layer === l.id ? "bg-lime-400 text-black font-bold" : "bg-emerald-900 text-emerald-100"}`}>
              {t(l.key)}
            </button>
          ))}
        </div>
      </div>

      {results.length > 1 && (
        <div className="bg-emerald-900 p-2 rounded text-white mb-2">
          {results.map((r) => (
            <p key={`${r.lat}-${r.lon}`} className="cursor-pointer hover:bg-emerald-700 p-1"
              onClick={() => { setLoc({ lat: r.lat, lon: r.lon }); setResults([]); }}>
              {placeName(r)}, {r.state || ""} {r.country}
            </p>
          ))}
        </div>
      )}

      <MapContainer center={[point.lat, point.lon]} zoom={7} style={{ height: "60vh", borderRadius: 12 }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        {API_KEY && (
          <TileLayer key={layer} url={`https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${API_KEY}`} opacity={0.7} attribution="© OpenWeather" />
        )}
        <FlyTo lat={point.lat} lon={point.lon} />
        <Marker position={[point.lat, point.lon]} icon={markerIcon}>
          <Popup>{t("weatherPoint")}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
