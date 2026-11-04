import React, { useEffect, useMemo, useState } from 'react';
import { IconChip, MapPin as PinD } from './ui/Icons';
import { MapPin, Search, X, ChevronRight } from 'lucide-react';
import { Language } from '../types';
import { getTranslation, districtName, LOCALES } from '../utils/translations';
import { PlatformService, District } from '../services/platformService';
import { MicButton } from './ui/Kit';

let cache: Promise<District[]> | null = null;
export const loadDistricts = () => (cache ||= PlatformService.getDistricts().catch((e) => { cache = null; throw e; }));

/** Big button that opens a searchable full-screen list of Karnataka districts (local script first). */
const DistrictPicker: React.FC<{ lang: Language; value: string; onChange: (id: string) => void; error?: boolean }> = ({ lang, value, onChange, error }) => {
  const t = getTranslation(lang);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState<District[]>([]);
  useEffect(() => { loadDistricts().then(setList).catch(() => {}); }, []);

  const label = (d: District) => districtName(t, d.id, d.name);
  const sorted = useMemo(() => [...list].sort((a, b) => label(a).localeCompare(label(b), LOCALES[lang])), [list, lang]);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const shown = sorted.filter((d) => !q || norm(label(d)).includes(norm(q)) || norm(d.name).includes(norm(q)) || ((d as any).aliases || []).some((a: string) => norm(a).includes(norm(q))));
  const current = list.find((d) => d.id === value);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-colors ${current ? 'border-agri-600 bg-agri-50' : error ? 'border-red-400 bg-red-50' : 'border-dashed border-gray-300 bg-paper hover:border-agri-400'}`}>
        <IconChip icon={PinD} tone="forest" />
        <span className="flex-1 min-w-0">
          <span className="block text-lg font-bold text-gray-900 leading-snug">{current ? label(current) : t.chooseDistrict}</span>
          {current && lang !== 'en' && <span className="block text-sm text-gray-500">{current.name}</span>}
        </span>
        <ChevronRight className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-paper flex flex-col animate-in fade-in duration-150" role="dialog" aria-label={t.chooseDistrict}>
          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
            <button onClick={() => setOpen(false)} aria-label={t.close} className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0"><X /></button>
            <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl pl-3 pr-1.5 py-1.5">
              <Search size={20} className="text-gray-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchDistrict} className="flex-1 min-w-0 bg-transparent outline-none text-lg py-1.5" />
              <MicButton lang={lang} onText={(txt) => setQ(txt)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 content-start">
            {shown.map((d) => (
              <button key={d.id} onClick={() => { onChange(d.id); setOpen(false); setQ(''); }}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left ${d.id === value ? 'border-agri-600 bg-agri-50' : 'border-gray-100 hover:border-agri-300'}`}>
                <MapPin className="text-agri-600 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-lg font-bold text-gray-900">{label(d)}</span>
                  {lang !== 'en' && <span className="block text-sm text-gray-500">{d.name}</span>}
                </span>
              </button>
            ))}
            {shown.length === 0 && <p className="text-gray-500 text-center py-10 col-span-full">{t.noMatch}</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default DistrictPicker;
