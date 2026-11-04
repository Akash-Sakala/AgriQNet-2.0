// src/components/plant-landing-hero.tsx

import { useState } from "react";
import { Sprout, Droplets, Wind, Stethoscope } from "lucide-react";
import { generateAgriAdvice } from "@/api/agri-advisor";
import type { WeatherData, ForecastData } from "@/api/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "@/i18n";

interface Props {
  weather: WeatherData | null;
  forecast: ForecastData | null;
}

export function PlantLandingHero({ weather, forecast }: Props) {
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  const triggerAI = async (type: string) => {
    if (!weather || !forecast) return;
    setLoading(type);
    const rain5 = forecast.list.slice(0, 5).map(d => d.main.humidity); // proxy rain since API lacks mm
    const advice = await generateAgriAdvice(type, {
      temp: weather.main.temp,
      humidity: weather.main.humidity,
      wind: weather.wind.speed,
      pressure: weather.main.pressure,
      vis: weather.visibility,
      rain: rain5,
    });
    setLoading(null);
    setResult(advice);
    document.getElementById("agri-ai-box")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-700/40 bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-950 px-6 py-6 sm:px-8 sm:py-8">

      {/* Glow Orbs */}
      <div className="absolute -right-8 -top-6 h-28 w-28 bg-lime-500/10 blur-2xl rounded-full" />
      <div className="absolute -left-10 bottom-0 h-24 w-24 bg-emerald-500/10 blur-xl rounded-full" />

      <div className="relative z-10">

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold text-lime-200 drop-shadow mb-3">
          {t("heroTitle")}
        </h1>
        <p className="text-emerald-100/80 max-w-xl mb-5">
          {t("heroDesc")}
        </p>

        {/* --- AI Action Buttons --- */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl">

          <button onClick={() => triggerAI("Sowing Window")}
            className="px-3 py-3 bg-neutral-900/40 backdrop-blur text-emerald-200 border border-lime-400/40 rounded-xl hover:bg-lime-600/10">
            <Sprout className="inline w-4 h-4 mr-1 text-lime-300"/> {t("sowingWindow")}
          </button>

          <button onClick={() => triggerAI("Irrigation Planner")}
            className="px-3 py-3 bg-neutral-900/40 text-sky-200 border border-sky-400/40 rounded-xl hover:bg-sky-600/10">
            <Droplets className="inline w-4 h-4 mr-1 text-sky-300"/> {t("irrigationPlanner")}
          </button>

          <button onClick={() => triggerAI("Spray Safety")}
            className="px-3 py-3 bg-neutral-900/40 text-cyan-200 border border-cyan-400/40 rounded-xl hover:bg-cyan-600/10">
            <Wind className="inline w-4 h-4 mr-1 text-cyan-300"/> {t("spraySafety")}
          </button>

          <button onClick={() => triggerAI("Crop Health")}
            className="px-3 py-3 bg-neutral-900/40 text-emerald-200 border border-green-400/40 rounded-xl hover:bg-green-600/10">
            <Stethoscope className="inline w-4 h-4 mr-1 text-green-300"/> {t("cropHealth")}
          </button>
        </div>

        {/* AI Response Box */}
        {loading && (
          <p className="text-emerald-200 mt-4 animate-pulse text-sm">{t("thinking")}</p>
        )}

        {/* ====================== AI RESULT MARKDOWN ====================== */}
        {result && (
        <div 
            id="agri-ai-box"
            className="mt-6 p-5 rounded-xl bg-emerald-950/70 border border-lime-400/40 max-w-2xl text-emerald-100 shadow-xl prose prose-invert prose-sm leading-relaxed"
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result}
            </ReactMarkdown>
        </div>
        )}


      </div>
    </section>
  );
}
