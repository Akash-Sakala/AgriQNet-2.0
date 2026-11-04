import {
  useForecastQuery,
  useReverseGeocodeQuery,
  useWeatherQuery,
  useDailyForecast16,
} from "@/hooks/use-weather";

import { CurrentWeather } from "../components/current-weather";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { MapPin, AlertTriangle, RefreshCw, LocateFixed } from "lucide-react";
import { useGeolocation } from "@/hooks/use-geolocation";
import { WeatherForecast } from "../components/weather-forecast";
import { HourlyTemperature } from "../components/hourly-temprature";
import WeatherSkeleton from "../components/loading-skeleton";
import { FavoriteCities } from "@/components/favorite-cities";
import { PlantLandingHero } from "@/components/plant-landing-hero";
import { WeatherMap } from "@/components/weather-map";
import { FarmWeatherAlerts } from "@/components/farm-weather-alerts";
import { t, placeName } from "@/i18n";

export function WeatherDashboard() {
  // Always resolves to a location (district from the main app → GPS → last used → Bengaluru)
  const { coordinates, source, place, gpsDenied, gpsBusy, isLoading, getLocation } = useGeolocation();
  const weatherQuery = useWeatherQuery(coordinates);
  const forecastQuery = useForecastQuery(coordinates);
  const dailyQuery = useDailyForecast16(coordinates);
  const locationQuery = useReverseGeocodeQuery(coordinates);

  if (isLoading || !coordinates) return <WeatherSkeleton />;

  if (weatherQuery.error || forecastQuery.error) return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("errorTitle")}</AlertTitle>
      <AlertDescription>
        <Button className="mt-2" onClick={() => { weatherQuery.refetch(); forecastQuery.refetch(); }}>
          {t("retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );

  if (!weatherQuery.data || !forecastQuery.data) return <WeatherSkeleton />;

  const locationName = locationQuery.data?.[0];
  const shownPlace = place || placeName(locationName) || weatherQuery.data.name;

  return (
    <div className="space-y-8 pb-10">
      {/* Where is this weather for? (never block the page when GPS is off) */}
      {source !== "gps" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-sm">
          <MapPin className="h-4 w-4 text-lime-300 shrink-0" />
          <p className="flex-1 text-emerald-100">
            {t("showingFor", { place: shownPlace })} {gpsDenied && <span className="opacity-80">{t("gpsDenied")}</span>}
          </p>
          <Button size="sm" variant="secondary" onClick={getLocation} disabled={gpsBusy} className="shrink-0">
            <LocateFixed className={`h-4 w-4 mr-1 ${gpsBusy ? "animate-pulse" : ""}`} /> {t("useGps")}
          </Button>
        </div>
      )}

      <FavoriteCities />

      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">{t("myFieldWeather")}</h1>
        <Button onClick={() => { weatherQuery.refetch(); forecastQuery.refetch(); dailyQuery.refetch(); }} size="icon" aria-label={t("retry")}>
          <RefreshCw />
        </Button>
      </div>

      {/* Agro-weather alerts (AgriQNet API, Open-Meteo based) */}
      <FarmWeatherAlerts lat={coordinates.lat} lon={coordinates.lon} />

      <div className="flex flex-col lg:flex-row gap-4">
        <CurrentWeather data={weatherQuery.data} locationName={locationName} />
        <HourlyTemperature data={forecastQuery.data} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <PlantLandingHero weather={weatherQuery.data} forecast={forecastQuery.data} />
        <div id="agri-forecast" className="scroll-mt-28">
          {/* the 16-day forecast is optional — the page still works if it fails */}
          {dailyQuery.data && <WeatherForecast data={dailyQuery.data} />}
        </div>
      </div>

      <div>
        <h2 className="text-xl text-emerald-100 font-semibold mb-3">{t("radarTitle")}</h2>
        <WeatherMap center={coordinates} />
      </div>
    </div>
  );
}
