import { LANG, t } from "@/i18n";

// AI farm advisory: Gemini runs on the AgriQNet API (/api/ai/weather-advice), never in the
// browser, and answers in the farmer's language.
export async function generateAgriAdvice(type: string, weather: any): Promise<string> {
  try {
    const res = await fetch("/api/ai/weather-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, weather, lang: LANG }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.text;
  } catch {
    return `⚠️ ${t("aiUnavailable")}`;
  }
}
