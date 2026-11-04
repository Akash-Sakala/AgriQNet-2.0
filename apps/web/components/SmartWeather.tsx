import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Farmer, Language } from '../types';
import { getTranslation, districtName } from '../utils/translations';
import { WEATHER_APP_URL } from '../services/config';
import { loadDistricts } from './DistrictPicker';
import { ScreenTitle } from './ui/Kit';

interface SmartWeatherProps {
  lang: Language;
  user?: Farmer | null;
  onBack: () => void;
}

/**
 * Embeds the weather station for the farmer's registered district (no GPS needed).
 * Language changes are posted into the frame, so it switches instantly without reloading.
 */
const SmartWeather: React.FC<SmartWeatherProps> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang);
  const [isLoading, setIsLoading] = useState(true);
  const [src, setSrc] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const firstLang = useRef(lang);

  useEffect(() => {
    const build = (lat?: number, lon?: number, place?: string) => {
      const p = new URLSearchParams({ lang: firstLang.current });
      if (lat !== undefined && lon !== undefined) { p.set('lat', String(lat)); p.set('lon', String(lon)); }
      if (place) p.set('place', place);
      setSrc(`${WEATHER_APP_URL}/?${p}`);
    };
    loadDistricts()
      .then((ds) => {
        const d = ds.find((x) => x.id === user?.districtId) || ds.find((x) => x.id === 'BNU');
        build(d?.geo?.lat, d?.geo?.lon, d ? districtName(getTranslation(firstLang.current), d.id, d.name) : undefined);
      })
      .catch(() => build());
  }, [user?.districtId]);

  // Instant language switch inside the weather station
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'agriqnet:lang', lang }, '*');
  }, [lang]);

  return (
    <div className="flex flex-col h-[calc(100dvh-170px)] lg:h-[calc(100vh-64px)] animate-in fade-in duration-300">
      <ScreenTitle lang={lang} icon="weather" title={t.tileWeather} desc={t.weatherStationDesc} onBack={onBack}
        right={src ? (
          <a href={src} target="_blank" rel="noopener noreferrer" aria-label={t.launchWeather} title={t.launchWeather}
            className="hidden sm:flex items-center gap-2 bg-agri-700 text-white px-4 py-3 rounded-2xl hover:bg-agri-700 font-bold">
            <ExternalLink size={18} /> <span className="hidden md:inline">{t.launchWeather}</span>
          </a>
        ) : undefined} />
      <div className="flex-1 bg-paper rounded-3xl shadow-soft border border-gray-100 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
            <Loader2 size={48} className="text-agri-500 animate-spin mb-4" />
            <p className="text-gray-600 font-medium">{t.loadingWeather}</p>
          </div>
        )}
        {src && (
          <iframe
            ref={frame}
            key={src}
            src={src}
            className="w-full h-full border-0"
            title={t.weatherStationTitle}
            onLoad={() => { setIsLoading(false); frame.current?.contentWindow?.postMessage({ type: 'agriqnet:lang', lang }, '*'); }}
            allow="geolocation"
          />
        )}
      </div>
    </div>
  );
};

export default SmartWeather;
