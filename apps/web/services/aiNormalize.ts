// AI answers (Gemini via the API, and their translations) don't always follow the JSON shape we
// asked for: fields go missing, arrays arrive as strings, numbers as text. Everything the screens
// render goes through these helpers first, so a sloppy answer hides a line instead of crashing.
import type { CropRecommendation, FertilizerPlan } from '../types';
import type { DistrictAdvice } from './platformService';

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === 'string' && v.trim() ? [v] : [];
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const confidence = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(str(v));
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(100, Math.max(0, n <= 1 ? n * 100 : n)));
};

export function normalizeCrops(raw: unknown): CropRecommendation[] {
  return list(raw)
    .map((item) => {
      const c = obj(item);
      const req = obj(c.requirements);
      return {
        ...c,
        name: str(c.name) || str(c.englishName),
        englishName: str(c.englishName),
        scientificName: str(c.scientificName),
        confidence: confidence(c.confidence),
        description: str(c.description),
        imageUrl: str(c.imageUrl),
        requirements: { water: str(req.water), sun: str(req.sun), soil: str(req.soil) },
        growthPeriod: str(c.growthPeriod),
        yieldPotential: str(c.yieldPotential),
        economicAnalysis: str(c.economicAnalysis),
      } as CropRecommendation;
    })
    .filter((c) => c.name);
}

export function normalizeFertilizerPlans(raw: unknown): FertilizerPlan[] {
  return list(raw)
    .map((item) => {
      const p = obj(item);
      return {
        ...p,
        name: str(p.name),
        description: str(p.description),
        applicationFrequency: str(p.applicationFrequency),
        dosage: str(p.dosage),
        warnings: strList(p.warnings),
      } as FertilizerPlan;
    })
    .filter((p) => p.name);
}

export function normalizeAdvice(raw: unknown): DistrictAdvice | null {
  const a = obj(raw);
  const tips = list(a.tips)
    .map((t) => { const o = obj(t); return { icon: str(o.icon), title: str(o.title), text: str(o.text) }; })
    .filter((t) => t.title || t.text);
  const headline = str(a.headline);
  if (!headline && !tips.length) return null;
  return { ...(a as object), districtId: str(a.districtId), season: str(a.season), month: str(a.month), headline, tips } as DistrictAdvice;
}
