import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { LANG } from "@/i18n";

/** Old /city/:name?lat&lon links: show that place on the main dashboard (which has the 16-day forecast). */
export function CityPage() {
  const [sp] = useSearchParams();
  const { cityName } = useParams();
  const q = new URLSearchParams({ lat: sp.get("lat") || "", lon: sp.get("lon") || "", place: cityName || "", lang: LANG });
  return <Navigate to={`/?${q}`} replace />;
}
