// 16-Day Agricultural Weather Forecast

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ArrowDown, ArrowUp, Droplets, Wind, Sprout } from "lucide-react";
import type { DailyForecast16Data } from "@/api/types";
import { t, dayLabel, conditionText } from "@/i18n";

interface WeatherForecastProps {
  data: DailyForecast16Data;
}

export function WeatherForecast({ data }: WeatherForecastProps) {
  const days = data.list; // already daily separated

  const formatTemp = (t: number) => `${Math.round(t)}°`;

  return (
    <Card className="border-emerald-700/40 bg-gradient-to-b from-emerald-900/70 via-emerald-950/85 to-slate-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-200">
          <Sprout className="h-5 w-5 text-green-300" />
          {t("forecastTitle")}
        </CardTitle>
        <p className="text-xs text-emerald-300/70 mt-1">
          {t("forecastDesc")}
        </p>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-1">
          {days.map((day, i) => {
            const date = new Date(day.dt * 1000);
            const label =
              i === 0 ? t("today") : i === 1 ? t("tomorrow") : dayLabel(date, { weekday: "short" });

            return (
              <div
                key={day.dt}
                className="grid grid-cols-[1.4fr,1.2fr,1.6fr] items-center gap-3 rounded-xl border border-emerald-700/50 bg-emerald-950/60 px-3 py-2.5 shadow-sm"
              >
                {/* date */}
                <div>
                  <p className="font-semibold text-emerald-50">
                    {label} · {dayLabel(date, { day: "numeric", month: "short" })}
                  </p>
                  <p className="text-xs text-emerald-200/80 capitalize">
                    {conditionText(day.weather[0].main, day.weather[0].description)}
                  </p>
                </div>

                {/* temp */}
                <div className="flex justify-center gap-4 text-xs">
                  <span className="flex items-center text-blue-400">
                    <ArrowDown className="mr-1 h-3 w-3" />
                    {formatTemp(day.temp.min)}
                  </span>
                  <span className="flex items-center text-amber-400">
                    <ArrowUp className="mr-1 h-3 w-3" />
                    {formatTemp(day.temp.max)}
                  </span>
                </div>

                {/* agro factors */}
                <div className="flex flex-wrap justify-end gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-emerald-100">
                    <Droplets className="h-3 w-3" /> {day.humidity}% RH
                  </span>
                  <span className="flex items-center gap-1 text-emerald-100">
                    <Wind className="h-3 w-3" /> {day.wind_speed?.toFixed(1)} m/s
                  </span>

                  {day.rain && (
                    <span className="rounded-full bg-emerald-900/80 px-2 py-[2px] text-emerald-100">
                      {t("rainMm", { mm: day.rain.toFixed(1) })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
