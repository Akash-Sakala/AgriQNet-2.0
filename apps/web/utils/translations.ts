// AgriQNet i18n
// ─────────────────────────────────────────────────────────────────────────────
// English (utils/i18n/en.json) is the single source of truth. hi/kn/te are generated
// with `npm run i18n` (Gemini, farmer-friendly wording) and can be hand-edited.
// Missing keys fall back to English, and `npm run i18n -- --check` reports them.
import { Language } from '../types';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import kn from './i18n/kn.json';
import te from './i18n/te.json';

export const LANGUAGES: Record<Language, string> = {
  en: 'English',
  hi: 'हिंदी (Hindi)',
  kn: 'ಕನ್ನಡ (Kannada)',
  te: 'తెలుగు (Telugu)',
};

/** BCP-47 locale used for dates, numbers and speech for each language */
export const LOCALES: Record<Language, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN', te: 'te-IN' };

type Dict = typeof en & Record<string, any>;
const RAW: Record<Language, Record<string, any>> = { en, hi, kn, te };

export const TRANSLATIONS: Record<Language, Dict> = Object.fromEntries(
  (Object.keys(RAW) as Language[]).map((l) => [l, { ...en, ...RAW[l] } as Dict])
) as Record<Language, Dict>;

export const getTranslation = (lang: Language): Dict => TRANSLATIONS[lang] || TRANSLATIONS.en;

/** Replace {placeholders}: fmt(t.alertSummary, { farmers: 3, districts: 2 }) */
export const fmt = (template: string, vars: Record<string, string | number> = {}) =>
  String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));

const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Localised name of a crop label returned by the ML model / Gemini (English key). */
export const cropName = (t: Dict, english: string) => t[`crop_${norm(english)}`] || english;
/** Localised fertilizer name ("Urea", "14-35-14"…) */
export const fertName = (t: Dict, english: string) => t[`fert_${english}`] || english;
/** Localised district name by id ("MYS") */
export const districtName = (t: Dict, id: string, fallback?: string) => t[`district_${id}`] || fallback || id;

/** Remembered UI language (shared by the main app and the embedded weather app). */
export const LANG_STORAGE_KEY = 'agriqnet_lang';
export function loadLanguage(): Language {
  try {
    const l = localStorage.getItem(LANG_STORAGE_KEY) as Language | null;
    if (l && l in LANGUAGES) return l;
  } catch { /* ignore */ }
  return 'en';
}
/** True once the farmer has picked a language on this device (first-run language screen). */
export function hasSavedLanguage(): boolean {
  try { return Boolean(localStorage.getItem(LANG_STORAGE_KEY)); } catch { return false; }
}
export function saveLanguage(l: Language) {
  try { localStorage.setItem(LANG_STORAGE_KEY, l); } catch { /* ignore */ }
}
