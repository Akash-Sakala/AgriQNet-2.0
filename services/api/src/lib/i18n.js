// Server-side translations (SMS, weather advisories, pest names, district names).
// Source: src/i18n/en.json + pests.en.json; hi/kn/te are produced by `npm run i18n`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'i18n');
export const LANGS = ['en', 'hi', 'kn', 'te'];

const load = (file) => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); } catch { return {}; }
};
const BUNDLES = Object.fromEntries(LANGS.map((l) => [l, { ...load('en.json'), ...load('pests.en.json'), ...load(`${l}.json`), ...load(`pests.${l}.json`) }]));

export const normLang = (l) => (LANGS.includes(l) ? l : 'en');

/** tr('kn', 'sms_RED', { pest: '…' }) */
export function tr(lang, key, vars = {}) {
  const s = BUNDLES[normLang(lang)][key] ?? BUNDLES.en[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}
export const has = (lang, key) => BUNDLES[normLang(lang)][key] !== undefined;

export const pestName = (lang, english) => tr(lang, `pest_${english}`) === `pest_${english}` ? english : tr(lang, `pest_${english}`);
export const cropGroupName = (lang, group) => (group ? (has(lang, `crop_${group}`) ? tr(lang, `crop_${group}`) : group) : group);
export const districtLabel = (lang, id, fallback) => (has(lang, `district_${id}`) ? tr(lang, `district_${id}`) : fallback || id);
export function managementTips(lang, group, englishTips = []) {
  return englishTips.map((tip, i) => (has(lang, `mgmt_${group}_${i}`) ? tr(lang, `mgmt_${group}_${i}`) : tip));
}

/** Pest document -> API shape with localised fields. */
export function localisePest(p, lang) {
  if (!p) return p;
  return {
    ...p,
    localName: pestName(lang, p.name),
    localCrop: cropGroupName(lang, p.crop),
    management: managementTips(lang, p.crop, p.management || []),
  };
}
