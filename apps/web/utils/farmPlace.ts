// The farmer's district as a weather place (lat/lon + localised name). Falls back to Bengaluru Urban.
import { useEffect, useState } from 'react';
import { Farmer, Language } from '../types';
import { getTranslation, districtName } from './translations';
import { loadDistricts } from '../components/DistrictPicker';
import { Place } from '../services/weatherService';

/** The farmer's district as a weather place (falls back to Bengaluru Urban). */
export function useFarmPlace(user?: Farmer | null, lang: Language = 'en') {
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    let live = true;
    const t = getTranslation(lang);
    loadDistricts().then((ds) => {
      const d = ds.find((x) => x.id === user?.districtId) || ds.find((x) => x.id === 'BNU');
      if (live && d?.geo) setPlace({ lat: d.geo.lat, lon: d.geo.lon, name: districtName(t, d.id, d.name) });
    }).catch(() => { if (live) setPlace({ lat: 12.97, lon: 77.59, name: districtName(t, 'BNU', 'Bengaluru Urban') }); });
    return () => { live = false; };
  }, [user?.districtId, lang]);
  return place;
}

