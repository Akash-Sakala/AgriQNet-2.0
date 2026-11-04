import React, { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, Siren, Users, Loader2, X, Plus, Search, MapPin, CheckCircle, Sprout, Bug, MessageSquare, Check, Ban, Send } from 'lucide-react';
import { Language, Farmer } from '../types';
import { ScreenTitle } from './ui/Kit';
import { motion, AnimatePresence } from 'motion/react';
import { IconChip, Ico, IdentificationBadge, EnvelopeSimple, CheckCircle as CheckD, XCircle, Warning, Bug as BugD } from './ui/Icons';
import { getTranslation, fmt, districtName, LOCALES, LANGUAGES } from '../utils/translations';
import {
  PlatformService, District, Edge, FarmerRow, PestInfo, pestDictionary, localPestName, zonesFor, TwilioSetup,
} from '../services/platformService';
import KarnatakaMap, { Zone, ZONE_FILL } from './KarnatakaMap';

/**
 * Alert Network — the former stand-alone Pest Alert dashboard (port 3001), now part of the
 * main app with the same look and language. Map (district choropleth), alerts and farmers.
 */
const DEPTH: Record<Zone, number> = { RED: 2, ORANGE: 1, YELLOW: 0 };
const RANK: Record<Zone, number> = { RED: 3, ORANGE: 2, YELLOW: 1 };
const ZONE_BY_HOP: Zone[] = ['RED', 'ORANGE', 'YELLOW'];

interface Alert { id: string; reportedDistrictId: string; severity: Zone; pestType: string; status: 'ACTIVE' | 'CANCELLED' | 'PENDING' | 'REJECTED'; reportedAt: string; detection?: { confidence?: number }; reason?: string }

const AlertNetwork: React.FC<{ lang: Language; user: Farmer; onBack: () => void }> = ({ lang, user, onBack }) => {
  const t = getTranslation(lang);
  const officer = user.role === 'officer';
  const [tab, setTab] = useState<'map' | 'alerts' | 'farmers' | 'sms'>('map');
  const [districts, setDistricts] = useState<District[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [farmers, setFarmers] = useState<FarmerRow[]>([]);
  const [pests, setPests] = useState<Record<string, PestInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(user.districtId || null);
  const [focusAlert, setFocusAlert] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string[]>([]);
  const known = React.useRef<Set<string> | null>(null);

  const dateFmt = new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric' });
  const numFmt = new Intl.NumberFormat(LOCALES[lang]);
  const sevLabel: Record<Zone, string> = { RED: t.sevRed, ORANGE: t.sevOrange, YELLOW: t.sevYellow };
  const zoneLabel: Record<Zone, string> = { RED: t.redZone, ORANGE: t.orangeZone, YELLOW: t.yellowZone };
  const dName = (id: string) => districtName(t, id, districts.find((d) => d.id === id)?.name);

  const load = async () => {
    try {
      const [d, e, a, f, p] = await Promise.all([
        PlatformService.getDistricts(), PlatformService.getEdges(), PlatformService.getAlerts(), officer ? PlatformService.getFarmers() : Promise.resolve([] as FarmerRow[]), pestDictionary(lang),
      ]);
      setDistricts(d); setEdges(e); setAlerts(a); setFarmers(f); setPests(p); setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { pestDictionary(lang).then(setPests); }, [lang]);

  // Live: check for new alerts every 4 s, so a report made on a farmer's phone appears on this
  // map within seconds — the zones fill in and the reported district ripples.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const a: Alert[] = await PlatformService.getAlerts();
        setAlerts((prev) => (JSON.stringify(prev.map((x) => x.id + x.status)) === JSON.stringify(a.map((x) => x.id + x.status)) ? prev : a));
      } catch { /* offline: keep the last map */ }
    }, 4000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const activeIds = alerts.filter((a) => a.status === 'ACTIVE').map((a) => a.id);
    if (known.current === null) { if (!loading) known.current = new Set(activeIds); return; }
    const fresh = alerts.filter((a) => a.status === 'ACTIVE' && !known.current!.has(a.id));
    known.current = new Set(activeIds);
    if (!fresh.length) return;
    const ids = fresh.map((a) => a.reportedDistrictId);
    setPulse(ids);
    setFocusAlert(null);
    setTab('map');
    setTimeout(() => document.getElementById('ka-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    setSelected(fresh[0].reportedDistrictId);
    flash(fmt(t.newAlertToast, { pest: localPestName(pests, fresh[0].pestType), district: dName(fresh[0].reportedDistrictId) }));
    const timer = setTimeout(() => setPulse([]), 6500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, loading]);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4500); };

  const active = alerts.filter((a) => a.status === 'ACTIVE');
  const labels = useMemo(() => Object.fromEntries(districts.map((d) => [d.id, dName(d.id)])), [districts, lang]);
  const farmerCount = useMemo(() => farmers.reduce<Record<string, number>>((m, f) => ({ ...m, [f.districtId]: (m[f.districtId] || 0) + 1 }), {}), [farmers]);

  /** For every district: strongest zone + which active alerts reach it (BFS over the district graph). */
  const coverage = useMemo(() => {
    const zones: Record<string, Zone> = {};
    const byDistrict: Record<string, { alert: Alert; zone: Zone }[]> = {};
    for (const a of active) {
      if (focusAlert && a.id !== focusAlert) continue;
      const z = zonesFor(a.reportedDistrictId, edges, DEPTH[a.severity]);
      [z.red, z.orange, z.yellow].forEach((ids, hop) => ids.forEach((id) => {
        const zone = ZONE_BY_HOP[hop];
        (byDistrict[id] ||= []).push({ alert: a, zone });
        if (!zones[id] || RANK[zone] > RANK[zones[id]]) zones[id] = zone;
      }));
    }
    return { zones, byDistrict };
  }, [active, edges, focusAlert]);

  const sel = districts.find((d) => d.id === selected);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-agri-600" size={40} /></div>;
  if (error) return <div className="bg-paper rounded-3xl p-8 text-center text-red-600 border border-red-100">{t.errServer}</div>;

  return (
    <div className="space-y-6">
      <ScreenTitle lang={lang} icon="network" title={t.networkTitle} desc={t.networkDesc} onBack={onBack} />
      {/* Stats */}
      <div className="bg-paper p-4 rounded-3xl shadow-soft border border-gray-100">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t.statDistricts, value: districts.length, icon: MapPin, color: 'text-agri-800 bg-agri-50' },
            officer ? { label: t.statFarmers, value: farmers.length, icon: Users, color: 'text-agri-800 bg-agri-50' } : { label: t.statPending, value: alerts.filter((a) => a.status === 'PENDING').length, icon: Users, color: 'text-gold-700 bg-gold-100' },
            { label: t.statActive, value: active.length, icon: Siren, color: 'text-red-700 bg-red-50' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-cream/60 p-3 md:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 min-w-0">
              <div className={`p-2 md:p-2.5 rounded-xl ${s.color}`}><s.icon size={20} /></div>
              <div className="min-w-0"><p className="font-display text-2xl md:text-3xl font-semibold text-ink leading-none tabular-nums">{numFmt.format(s.value)}</p><p className="text-xs md:text-sm text-gray-600 mt-1 leading-tight">{s.label}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl w-full md:w-fit overflow-x-auto">
        {([['map', t.tabMap, MapIcon], ['alerts', t.tabAlerts, Siren], ...(officer ? [['farmers', t.tabFarmers, Users], ['sms', t.tabSms, MessageSquare]] : [])] as [typeof tab, string, any][]).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 md:flex-none shrink-0 px-4 md:px-5 py-2.5 rounded-xl font-bold whitespace-nowrap text-sm md:text-base flex items-center justify-center gap-2 transition-all ${tab === id ? 'bg-paper text-agri-700 shadow' : 'text-gray-500'}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-paper rounded-3xl shadow-soft border border-gray-100 p-4 md:p-6">
            {/* Alert focus chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setFocusAlert(null)} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${!focusAlert ? 'bg-agri-700 text-white border-agri-600' : 'bg-paper text-gray-600 border-gray-200'}`}>{t.all}</button>
              {active.map((a) => (
                <button key={a.id} onClick={() => setFocusAlert(focusAlert === a.id ? null : a.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border flex items-center gap-1.5 ${focusAlert === a.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-paper text-gray-700 border-gray-200'}`}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_FILL[a.severity] }} />
                  {localPestName(pests, a.pestType)} · {dName(a.reportedDistrictId)}
                </button>
              ))}
            </div>
            <div id="ka-map" className="scroll-mt-24"><KarnatakaMap zones={coverage.zones} labels={labels} selected={selected} onSelect={setSelected} markers={farmerCount} pulse={pulse} /></div>
            {active.length === 0 && (
              <p className="mt-3 flex items-center gap-2 justify-center text-agri-800 bg-agri-50 border border-agri-100 rounded-2xl p-3"><Ico icon={CheckD} size={22} />{t.noActiveMap}</p>
            )}
            {/* Legend: colour + text, never colour alone */}
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-700">
              {(['RED', 'ORANGE', 'YELLOW'] as Zone[]).map((z) => (
                <span key={z} className="flex items-center gap-2"><span className="w-4 h-4 rounded" style={{ background: ZONE_FILL[z] }} />{zoneLabel[z]}</span>
              ))}
              <span className="flex items-center gap-2"><span className="w-4 h-4 rounded border border-gray-200" style={{ background: ZONE_FILL.NONE }} />{t.zoneNone}</span>
              {officer && <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-green-800" />{t.statFarmers}</span>}
            </div>
          </div>

          {/* District details */}
          <div className="bg-paper rounded-3xl shadow-soft border border-gray-100 p-6">
            {!sel ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
                <MapPin size={40} className="mb-3 opacity-40" />
                <p className="text-base">{t.tapDistrict}</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{dName(sel.id)}</h3>
                    {coverage.zones[sel.id] ? (
                      <span className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full text-sm font-bold" style={{ background: ZONE_FILL[coverage.zones[sel.id]] + '33', color: '#7f1d1d' }}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: ZONE_FILL[coverage.zones[sel.id]] }} />{zoneLabel[coverage.zones[sel.id]]}
                      </span>
                    ) : <span className="inline-block mt-2 px-3 py-1 rounded-full text-sm font-bold bg-green-50 text-green-700">{t.zoneNone}</span>}
                  </div>
                  <button onClick={() => setSelected(null)} aria-label={t.close} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {officer && <div className="bg-gray-50 rounded-xl p-3"><p className="text-gray-500">{t.statFarmers}</p><p className="font-bold text-lg">{numFmt.format(farmerCount[sel.id] || 0)}</p></div>}
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-gray-500">{t.population}</p><p className="font-bold text-lg">{sel && (sel as any).meta?.population ? numFmt.format((sel as any).meta.population) : '—'}</p></div>
                </div>
                {sel.majorCrops && sel.majorCrops.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-500 mb-2 flex items-center gap-1"><Sprout size={14} /> {t.majorCrops}</p>
                    <div className="flex flex-wrap gap-2">{sel.majorCrops.map((c) => <span key={c} className="px-2.5 py-1 rounded-lg bg-agri-50 text-agri-800 text-sm">{(t as any)[`crop_${c.toLowerCase().replace(/[^a-z]/g, '')}`] || c}</span>)}</div>
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-gray-800 mb-2">{t.alertsAffecting}</p>
                  {(coverage.byDistrict[sel.id] || []).length === 0 ? <p className="text-sm text-gray-500">{t.noAlertsHere}</p> : (
                    <ul className="space-y-2">
                      {coverage.byDistrict[sel.id].map(({ alert, zone }) => (
                        <li key={alert.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                          <div className="flex items-center gap-2 font-semibold text-gray-800"><Bug size={14} className="text-red-500" />{localPestName(pests, alert.pestType)}</div>
                          <p className="text-gray-500 mt-0.5">{zoneLabel[zone]} · {t.reportedIn} {dName(alert.reportedDistrictId)} · {dateFmt.format(new Date(alert.reportedAt))}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <AlertsTab
          t={t} lang={lang} officer={officer} alerts={alerts} districts={districts} pests={pests} dName={dName} sevLabel={sevLabel} dateFmt={dateFmt}
          onChanged={async (msg) => { await load(); flash(msg); }}
        />
      )}

      {tab === 'sms' && officer && <SmsSetupPanel t={t} lang={lang} />}

      {tab === 'farmers' && officer && (
        <FarmersTab t={t} lang={lang} farmers={farmers} districts={districts} dName={dName} onChanged={async (msg) => { await load(); flash(msg); }} />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="status" className="fixed bottom-24 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 bg-ink text-white px-5 py-3.5 rounded-2xl shadow-lift flex items-center gap-3 sm:max-w-md">
            <CheckCircle size={20} className="text-gold-300 shrink-0" /> <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ───────────────────────── Alerts tab ─────────────────────────
// Farmers report pests through the photo flow (Pest photo). Here officers check reports that
// were not sent automatically, and can cancel alerts. Farmers only see the history.
const AlertsTab: React.FC<{
  t: any; lang: Language; officer: boolean; alerts: Alert[]; districts: District[]; pests: Record<string, PestInfo>;
  dName: (id: string) => string; sevLabel: Record<Zone, string>; dateFmt: Intl.DateTimeFormat; onChanged: (msg: string) => void;
}> = ({ t, officer, alerts, pests, dName, sevLabel, dateFmt, onChanged }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [sev, setSev] = useState<Record<string, Zone>>({});
  const pending = alerts.filter((a) => a.status === 'PENDING');
  const history = alerts.filter((a) => a.status !== 'PENDING');
  const statusChip: Record<Alert['status'], [string, string]> = {
    ACTIVE: [t.statusActive, 'bg-red-50 text-red-700'], CANCELLED: [t.statusCancelled, 'bg-gray-100 text-gray-500'],
    PENDING: [t.statusPending, 'bg-yellow-50 text-yellow-800'], REJECTED: [t.statusRejected, 'bg-gray-100 text-gray-500'],
  };

  const act = async (id: string, fn: () => Promise<any>, msg: string) => {
    setBusy(id);
    try { await fn(); onChanged(msg); } catch (e: any) { alert(e.message || t.errServer); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="bg-gold-100/60 rounded-3xl border border-gold-300 p-4 md:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-1"><Ico icon={IdentificationBadge} size={22} tone="gold" />{t.pendingReports} ({pending.length})</h3>
          <p className="text-gray-700 mb-4">{officer ? t.pendingOfficerHint : t.pendingFarmerHint}</p>
          <ul className="space-y-3">
            {pending.map((a) => {
              const s = sev[a.id] || a.severity;
              return (
                <li key={a.id} className="bg-paper rounded-2xl border border-yellow-100 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Bug size={18} className="text-red-500" />
                    <p className="font-bold text-gray-900 text-lg">{localPestName(pests, a.pestType)}</p>
                    <span className="text-gray-600">· {dName(a.reportedDistrictId)} · {dateFmt.format(new Date(a.reportedAt))}</span>
                    {a.detection?.confidence !== undefined && <span className="ml-auto text-sm px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{t.photoMatch}: {Math.round((a.detection.confidence || 0) * 100)}%</span>}
                  </div>
                  {officer && (
                    <div className="flex flex-wrap gap-2">
                      {(['RED', 'ORANGE', 'YELLOW'] as Zone[]).map((z) => (
                        <button key={z} onClick={() => setSev({ ...sev, [a.id]: z })}
                          className={`px-3 py-2 rounded-xl border-2 font-bold text-sm flex items-center gap-1 ${s === z ? 'border-gray-900' : 'border-gray-200'}`}>
                          <span className="w-3 h-3 rounded-full" style={{ background: ZONE_FILL[z] }} />{sevLabel[z]}{s === z && <Check size={14} />}
                        </button>
                      ))}
                      <span className="flex-1" />
                      <button disabled={busy === a.id} onClick={() => act(a.id, () => PlatformService.approveAlert(a.id, s), t.alertReported)} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold flex items-center gap-2">
                        {busy === a.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t.approveSend}
                      </button>
                      <button disabled={busy === a.id} onClick={() => act(a.id, () => PlatformService.rejectAlert(a.id), t.reportRejected)} className="px-4 py-2 rounded-xl border-2 border-gray-300 text-gray-700 font-bold flex items-center gap-2">
                        <Ban size={16} /> {t.reject}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="bg-paper rounded-3xl shadow-soft border border-gray-100 p-4 md:p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{t.alertHistory}</h3>
        {history.length === 0 ? <p className="text-gray-500">{t.noAlerts}</p> : (
          <ul className="divide-y divide-gray-100">
            {history.map((a) => (
              <li key={a.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: ZONE_FILL[a.severity] }} />
                <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">
                  <p className="font-semibold text-gray-900">{localPestName(pests, a.pestType)}</p>
                  <p className="text-sm text-gray-500">{dName(a.reportedDistrictId)} · {sevLabel[a.severity]} · {fmt(t.reportedOn, { date: dateFmt.format(new Date(a.reportedAt)) })}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusChip[a.status][1]}`}>{statusChip[a.status][0]}</span>
                {officer && a.status === 'ACTIVE' && (
                  <button disabled={busy === a.id} onClick={() => window.confirm(`${t.cancelAlert}?`) && act(a.id, () => PlatformService.cancelAlert(a.id), t.alertCancelled)}
                    className="text-sm font-semibold text-gray-600 hover:text-red-600 px-3 py-1.5 rounded-lg border border-gray-200">{t.cancelAlert}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ───────────────────────── SMS setup (Twilio trial) ─────────────────────────
const SmsSetupPanel: React.FC<{ t: any; lang: Language }> = ({ t, lang }) => {
  const [info, setInfo] = useState<TwilioSetup | null>(null);
  const [err, setErr] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => { PlatformService.smsSetup().then((i) => { setInfo(i); if (i.verifiedNumbers[0]) setTo(i.verifiedNumbers[0]); }).catch((e) => setErr(e.message)); }, []);

  const test = async () => {
    setBusy(true); setRes(null);
    try {
      const r = await PlatformService.smsTest(to, lang);
      setRes({ ok: r.status === 'sent', msg: r.status === 'sent' ? t.testSent : r.error || t.testFailed });
    } catch (e: any) {
      setRes({ ok: false, msg: e.data?.error || e.message || t.testFailed });
    } finally { setBusy(false); }
  };

  if (err) return <div className="bg-paper rounded-3xl p-6 border border-red-100 text-red-700">{err}</div>;
  if (!info) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-agri-600" /></div>;
  const trial = info.accountType === 'Trial';
  return (
    <div className="bg-paper rounded-3xl shadow-soft border border-gray-100 p-5 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <IconChip icon={EnvelopeSimple} tone="forest" />
        <div>
          <h3 className="text-xl font-bold text-gray-900">{t.smsSetupTitle}</h3>
          <p className="text-gray-600">{t.smsSetupDesc}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className={`rounded-2xl p-4 border-2 ${info.configured ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <p className="text-sm text-gray-600">{t.smsStatus}</p>
          <p className="font-bold text-lg"><span className="inline-flex items-center gap-1.5">{info.configured ? <><Ico icon={CheckD} size={22} tone="forest" />{t.smsConnected}</> : <><Ico icon={XCircle} size={22} tone="red" />{t.smsNotConnected}</>}</span></p>
          <p className="text-xs text-gray-500 mt-1">SMS_MODE={info.mode}</p>
        </div>
        <div className="rounded-2xl p-4 border-2 border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-600">{t.smsAccount}</p>
          <p className="font-bold text-lg">{info.accountType || '—'} {info.status ? `· ${info.status}` : ''}</p>
        </div>
        <div className="rounded-2xl p-4 border-2 border-gray-100 bg-gray-50">
          <p className="text-sm text-gray-600">{t.smsFrom}</p>
          <p className="font-bold text-lg font-mono">{info.from || '—'}</p>
        </div>
      </div>
      {info.error && <p className="text-red-700 bg-red-50 rounded-xl p-3">{info.error}</p>}
      {trial && <p className="flex gap-2 bg-gold-100 border border-gold-300 rounded-2xl p-4 text-gold-700"><Ico icon={Warning} size={22} className="mt-0.5" />{t.trialNote}</p>}
      <div>
        <p className="font-bold text-gray-900 mb-2">{t.verifiedNumbers} ({info.verifiedNumbers.length})</p>
        {info.verifiedNumbers.length === 0 ? <p className="text-gray-600">{t.noVerified}</p> : (
          <div className="flex flex-wrap gap-2">{info.verifiedNumbers.map((n) => <button key={n} onClick={() => setTo(n)} className={`px-3 py-1.5 rounded-xl font-mono border ${to === n ? 'border-agri-600 bg-agri-50' : 'border-gray-200'}`}>{n}</button>)}</div>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+91…" className="flex-1 p-3 rounded-xl border border-gray-200 font-mono text-lg" />
        <button onClick={test} disabled={busy || !to || !info.configured} className="px-5 py-3 rounded-xl bg-agri-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} {t.sendTestSms}
        </button>
      </div>
      {res && <p className={`rounded-xl p-3 ${res.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}><span className="inline-flex items-center gap-2"><Ico icon={res.ok ? CheckD : XCircle} size={20} />{res.msg}</span></p>}
      <details className="bg-gray-50 rounded-2xl p-4">
        <summary className="font-bold cursor-pointer">{t.twilioHowTo}</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-gray-700">
          {[t.twilioStep1, t.twilioStep2, t.twilioStep3, t.twilioStep4].map((s: string, i: number) => <li key={i}>{s}</li>)}
        </ol>
      </details>
    </div>
  );
};

// ───────────────────────── Farmers tab ─────────────────────────
const FarmersTab: React.FC<{
  t: any; lang: Language; farmers: FarmerRow[]; districts: District[]; dName: (id: string) => string; onChanged: (msg: string) => void;
}> = ({ t, lang, farmers, districts, dName, onChanged }) => {
  const [q, setQ] = useState('');
  const [district, setDistrict] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', districtId: '', lang });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sorted = [...districts].sort((a, b) => dName(a.id).localeCompare(dName(b.id), LOCALES[lang]));
  const list = farmers.filter((f) => (!district || f.districtId === district) && (!q || f.name.toLowerCase().includes(q.toLowerCase()) || f.phone.includes(q)));

  const add = async () => {
    if (!form.name || form.phone.replace(/\D/g, '').length < 10 || !form.districtId) { setErr(!form.districtId ? t.errSelectDistrict : t.errValidMobile); return; }
    setBusy(true); setErr('');
    try {
      await PlatformService.addFarmer({ ...form, phone: form.phone.startsWith('+') ? form.phone : `+91${form.phone.replace(/\D/g, '')}` });
      setOpen(false); setForm({ name: '', phone: '', districtId: '', lang });
      onChanged(t.farmerAdded);
    } catch (e: any) { setErr(e.message || t.errSubscribe); } finally { setBusy(false); }
  };

  return (
    <div className="bg-paper rounded-3xl shadow-soft border border-gray-100 p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchFarmers} className="w-full pl-9 p-3 bg-gray-50 border border-gray-200 rounded-xl" />
        </div>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <option value="">{t.all}</option>
          {sorted.map((d) => <option key={d.id} value={d.id}>{dName(d.id)}</option>)}
        </select>
        <button onClick={() => setOpen(!open)} className="bg-agri-700 hover:bg-agri-800 text-white font-bold px-5 py-3 rounded-xl flex items-center justify-center gap-2"><Plus size={18} /> {t.addFarmer}</button>
      </div>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-agri-50 border border-agri-100 rounded-2xl p-4">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t.farmerName} className="p-3 rounded-xl border border-gray-200" />
          <input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t.mobileNumber} className="p-3 rounded-xl border border-gray-200" />
          <select value={form.districtId} onChange={(e) => setForm({ ...form, districtId: e.target.value })} className="p-3 rounded-xl border border-gray-200">
            <option value="">{t.selectDistrict}</option>
            {sorted.map((d) => <option key={d.id} value={d.id}>{dName(d.id)}</option>)}
          </select>
          <select value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value as Language })} className="p-3 rounded-xl border border-gray-200" aria-label="SMS language">
            {(Object.keys(LANGUAGES) as Language[]).map((l) => <option key={l} value={l}>SMS: {LANGUAGES[l].split(' (')[0]}</option>)}
          </select>
          <button onClick={add} disabled={busy} className="bg-agri-700 text-white font-bold rounded-xl p-3 flex items-center justify-center">{busy ? <Loader2 className="animate-spin" /> : t.addFarmer}</button>
          {err && <p className="text-red-600 text-sm md:col-span-5">{err}</p>}
        </div>
      )}

      {list.length === 0 ? <p className="text-gray-500 py-6 text-center">{t.noFarmers}</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b border-gray-100"><th className="py-2 pr-4 font-semibold">{t.farmerName}</th><th className="py-2 pr-4 font-semibold">{t.phoneNumber}</th><th className="py-2 pr-4 font-semibold">{t.district}</th><th className="py-2 font-semibold">SMS</th></tr></thead>
            <tbody>
              {list.slice(0, 300).map((f) => (
                <tr key={f.id} className="border-b border-gray-50">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{f.name}</td>
                  <td className="py-2.5 pr-4 font-mono text-gray-600">{f.phone}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{dName(f.districtId)}</td>
                  <td className="py-2.5 text-gray-500">{LANGUAGES[(f.lang as Language) || 'en']?.split(' (')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AlertNetwork;
