import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { t, LANG, dayLabel } from "@/i18n";

interface WeatherAlert {
  type: string;
  level: "RED" | "ORANGE" | "YELLOW";
  date: string;
  title: string;
  message: string;
  advice: string;
}

const STYLE: Record<string, string> = {
  RED: "border-red-500/60 bg-red-950/50 text-red-100",
  ORANGE: "border-orange-500/60 bg-orange-950/40 text-orange-100",
  YELLOW: "border-yellow-500/60 bg-yellow-950/30 text-yellow-100",
};

/** 7-day agro-weather alerts (heavy rain, heat, wind, thunderstorm, disease risk, dry spell). */
export function FarmWeatherAlerts({ lat, lon }: { lat: number; lon: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["farm-alerts", lat, lon, LANG],
    queryFn: async () => {
      const r = await fetch(`/api/weather/alerts?lat=${lat}&lon=${lon}&lang=${LANG}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { highest: string; alerts: WeatherAlert[] };
    },
  });

  return (
    <Card className="border-emerald-700/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-amber-400" /> {t("farmAlertsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">{t("checkingForecast")}</p>}
        {error && <p className="text-sm text-red-400">{t("alertsUnavailable")}</p>}
        {data && data.alerts.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> {t("noRisks")}
          </p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {data?.alerts.slice(0, 6).map((a, i) => (
            <div key={i} className={`rounded-xl border px-3 py-2 text-sm ${STYLE[a.level]}`}>
              <div className="flex items-center justify-between font-semibold">
                <span>{t(`level_${a.level}`)} · {a.title}</span>
                <span className="text-xs opacity-70">{dayLabel(new Date(a.date), { day: "numeric", month: "short" })}</span>
              </div>
              <p className="text-xs opacity-90 mt-1">{a.message} {a.advice}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
