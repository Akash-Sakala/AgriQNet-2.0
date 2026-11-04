// Weather-station i18n. The language comes from ?lang= (set by the main AgriQNet app when it
// embeds this page) and is remembered in localStorage for in-app navigation.
import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import te from "./te.json";

export type Lang = "en" | "hi" | "kn" | "te";
const DICTS: Record<Lang, Record<string, string>> = { en, hi, kn, te };
export const LOCALES: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN", te: "te-IN" };

function detectLang(): Lang {
  const url = new URLSearchParams(window.location.search).get("lang") as Lang | null;
  if (url && url in DICTS) {
    try { localStorage.setItem("agriqnet_lang", url); } catch { /* ignore */ }
    return url;
  }
  try {
    const saved = localStorage.getItem("agriqnet_lang") as Lang | null;
    if (saved && saved in DICTS) return saved;
  } catch { /* ignore */ }
  return "en";
}

// `let` exports are live bindings: every module that imports LANG sees the new value.
export let LANG: Lang = detectLang();
export let LOCALE = LOCALES[LANG];
document.documentElement.lang = LANG;

const listeners = new Set<() => void>();
/** Switch language in place (used when the main app changes language) — no page reload. */
export function setLang(l: Lang) {
  if (!(l in DICTS) || l === LANG) return;
  LANG = l;
  LOCALE = LOCALES[l];
  document.documentElement.lang = l;
  try { localStorage.setItem("agriqnet_lang", l); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}
export const onLangChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

// The AgriQNet app posts {type:"agriqnet:lang", lang} to this iframe when the farmer switches language.
window.addEventListener("message", (e) => {
  const d = e.data;
  if (d && d.type === "agriqnet:lang") setLang(d.lang);
});

/** t("feelsLike", { t: "24°" }) — falls back to English, then to the key. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = DICTS[LANG][key] ?? DICTS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

/** Weather condition text: OpenWeather has no Kannada/Telugu, so use our own words by group. */
export function conditionText(main: string, description: string): string {
  if (LANG === "en") return description;
  const k = `cond_${main}`;
  return DICTS[LANG][k] ?? DICTS.en[k] ?? description;
}

export const dayLabel = (date: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, opts).format(date);

/** Prefer the place name in the farmer's script (OpenWeather geocoding local_names). */
export const placeName = (loc?: { name?: string; local_names?: Record<string, string> }) =>
  (loc?.local_names && loc.local_names[LANG]) || loc?.name || "";
