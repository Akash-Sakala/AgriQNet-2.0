// Fuzzy matching of free-text locations ("Mysore", "Bangalore rural", "Hubli") to district ids.
import { District } from '../models/index.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

export async function matchDistrict(text) {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;
  const all = await District.find().lean();
  // 1) exact id / name / alias
  for (const d of all) {
    const keys = [d.id, d.name, ...(d.aliases || [])].map(norm);
    if (keys.includes(q)) return d;
  }
  // 2) the text contains a district name/alias (longest match wins: "bengaluru rural" > "bengaluru")
  let best = null;
  let bestLen = 0;
  for (const d of all) {
    for (const k of [d.name, ...(d.aliases || [])].map(norm)) {
      if (k.length >= 4 && q.includes(k) && k.length > bestLen) {
        best = d;
        bestLen = k.length;
      }
    }
  }
  return best;
}
