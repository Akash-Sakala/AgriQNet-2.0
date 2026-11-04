import React, { useEffect, useState } from 'react';
import { CloudLightning, Bug, Activity, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Farmer, Language } from '../types';
import { getTranslation, districtName, LOCALES } from '../utils/translations';
import { PlatformService, WeatherAlert, pestDictionary, localPestName } from '../services/platformService';

const LEVEL_STYLE: Record<string, string> = {
  RED: 'bg-red-50 border-red-200 text-red-800',
  ORANGE: 'bg-orange-50 border-orange-200 text-orange-800',
  YELLOW: 'bg-yellow-50 border-yellow-200 text-yellow-800',
};
const DOT: Record<string, string> = { RED: 'bg-red-500', ORANGE: 'bg-orange-400', YELLOW: 'bg-yellow-400' };

/**
 * Dashboard panel for the logged-in farmer, fully in the selected language:
 *  • agro-weather alerts for their district (server-localised text)
 *  • active pest outbreaks (localised pest + district names)
 *  • status of each AgriQNet service, in plain words
 */
const FarmAlertsPanel: React.FC<{ user?: Farmer | null; lang: Language }> = ({ user, lang }) => {
  const t = getTranslation(lang);
  const [weather, setWeather] = useState<{ districtId?: string; label: string; alerts: WeatherAlert[] } | null>(null);
  const [weatherErr, setWeatherErr] = useState(false);
  const [pestAlerts, setPestAlerts] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const dateFmt = new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short' });

  const districtQuery = user?.districtId ? { districtId: user.districtId } : { district: user?.location || 'Bengaluru Urban' };

  useEffect(() => {
    PlatformService.weatherAlerts({ ...districtQuery, lang })
      .then((r) => setWeather({ districtId: r.location?.districtId, label: r.location?.label, alerts: r.alerts }))
      .catch(() => setWeatherErr(true));
    Promise.all([PlatformService.getAlerts(), pestDictionary(lang)])
      .then(([alerts, pests]) => {
        setPestAlerts(alerts.filter((a) => a.status === 'ACTIVE').slice(0, 4).map((a) => ({ ...a, pestLocal: localPestName(pests, a.pestType) })));
      })
      .catch(() => {});
    PlatformService.health().then(setHealth).catch(() => setHealth({ api: 'down' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phone, lang]);

  const svc = health?.services || {};
  const statusRows: [string, boolean][] = health ? [
    [t.svcServer, health.api === 'up' && health.mongo === 'connected'],
    [t.svcPestScanner, !!svc.pestDetector?.up],
    [t.svcModels, !!svc.recommender?.up],
    [t.svcFarmBooks, !!svc.rag?.up],
    [t.svcAi, !!health.gemini?.configured],
  ] : [];

  const place = weather?.districtId ? districtName(t, weather.districtId, weather.label) : weather?.label || '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Weather alerts */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <CloudLightning className="text-blue-500" size={22} />
          <h3 className="font-bold text-lg text-gray-800">{t.weatherAlertsTitle}</h3>
          <span className="ml-auto text-xs text-gray-400 text-right">{place} · {t.next7Days}</span>
        </div>
        {!weather && !weatherErr && <Loader2 className="animate-spin text-gray-400" />}
        {weatherErr && <p className="text-sm text-red-500">{t.errServer}</p>}
        {weather && weather.alerts.length === 0 && (
          <p className="text-base text-green-700 bg-green-50 border border-green-100 rounded-xl p-3">✅ {t.noWeatherRisk}</p>
        )}
        <div className="space-y-2">
          {weather?.alerts.slice(0, 4).map((a, i) => (
            <div key={i} className={`border rounded-xl p-3 text-sm ${LEVEL_STYLE[a.level]}`}>
              <div className="flex items-center gap-2 font-bold"><span className={`w-2.5 h-2.5 rounded-full ${DOT[a.level]}`} />{a.title}<span className="ml-auto text-xs font-medium opacity-70">{dateFmt.format(new Date(a.date))}</span></div>
              <p className="text-sm mt-1 opacity-90">{a.message} {a.advice}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pest outbreaks */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="text-red-500" size={22} />
          <h3 className="font-bold text-lg text-gray-800">{t.activeOutbreaks}</h3>
        </div>
        {pestAlerts.length === 0 ? <p className="text-sm text-gray-500">{t.noOutbreaks}</p> : (
          <ul className="space-y-3">
            {pestAlerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className={`w-3 h-3 shrink-0 rounded-full ${DOT[a.severity]}`} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{a.pestLocal}</p>
                  <p className="text-gray-500 text-xs truncate">{districtName(t, a.reportedDistrictId)}</p>
                </div>
                <span className="ml-auto text-xs text-gray-400 shrink-0">{dateFmt.format(new Date(a.reportedAt))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Service status */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="text-agri-600" size={22} />
          <h3 className="font-bold text-lg text-gray-800">{t.serviceStatus}</h3>
        </div>
        {!health ? <Loader2 className="animate-spin text-gray-400" /> : health.api === 'down' ? (
          <p className="text-sm text-red-500">{t.errServer}</p>
        ) : (
          <ul className="space-y-2">
            {statusRows.map(([name, up]) => (
              <li key={name} className="flex items-center gap-2 text-sm text-gray-700">
                {up ? <CheckCircle2 size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-400" />}
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FarmAlertsPanel;
