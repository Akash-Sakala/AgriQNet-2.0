// The farm profile the advisors reuse (district, soil, water, field size), so a farmer answers once.
// Saved on the device straight away and to the account in the background (best effort).
import { useState } from 'react';
import { Farmer } from '../types';
import { DBService } from '../services/dbService';

export interface FarmProfile { districtId: string; soilType: string; waterSource: string; fieldSize: string }
const KEY = 'agriqnet_farm_profile';

function readLocal(): Partial<FarmProfile> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function useFarmProfile(user: Farmer) {
  const [profile, setProfile] = useState<FarmProfile>(() => {
    const local = readLocal();
    return {
      districtId: user.districtId || local.districtId || '',
      soilType: user.soilType || local.soilType || '',
      waterSource: user.waterSource || local.waterSource || '',
      fieldSize: user.fieldSize || local.fieldSize || '',
    };
  });
  const save = (changes: Partial<FarmProfile>) => {
    const next = { ...profile, ...changes };
    setProfile(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
    const cached = DBService.getCachedUser();
    if (cached) DBService.cacheUser({ ...cached, ...next });
    if (user.token) DBService.updateProfile(changes).catch(() => { /* kept on the device */ });
  };
  const complete = !!(profile.districtId && profile.soilType && profile.waterSource && profile.fieldSize);
  return { profile, save, complete };
}
