import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { ArrowUpRight, TrendingUp, Sprout, Tractor, Droplets, Map as MapIcon } from 'lucide-react';
import WeatherWidget from './WeatherWidget';
import FarmAlertsPanel from './FarmAlertsPanel';
import { Language, Farmer } from '../types';
import { getTranslation, LOCALES } from '../utils/translations';

interface DashboardProps {
  lang: Language;
  user?: Farmer | null;
}

const yieldData = [
  { name: 'Jan', value: 4000 },
  { name: 'Feb', value: 3000 },
  { name: 'Mar', value: 5000 },
  { name: 'Apr', value: 4500 },
  { name: 'May', value: 6000 },
  { name: 'Jun', value: 7500 },
];

const moistureData = [
  { name: 'Mon', val: 65 },
  { name: 'Tue', val: 59 },
  { name: 'Wed', val: 80 },
  { name: 'Thu', val: 81 },
  { name: 'Fri', val: 56 },
  { name: 'Sat', val: 55 },
  { name: 'Sun', val: 40 },
];

const StatCard: React.FC<{title: string, value: string, icon: any, color: string, trend: string}> = ({title, value, icon: Icon, color, trend}) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-2xl ${color} bg-opacity-10 text-opacity-100`}>
        <Icon className={color.replace('bg-', 'text-')} size={24} />
      </div>
    </div>
    <div className="mt-4 flex items-center gap-1 text-sm text-green-600 bg-green-50 w-fit px-2 py-1 rounded-full">
      <ArrowUpRight size={14} />
      <span className="font-semibold">{trend}</span>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ lang, user }) => {
  const t = getTranslation(lang);
  // Chart axis labels in the farmer's language
  const monthFmt = new Intl.DateTimeFormat(LOCALES[lang], { month: 'short' });
  const dayFmt = new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'short' });
  const yieldChart = yieldData.map((d, i) => ({ ...d, name: monthFmt.format(new Date(2026, i, 1)) }));
  const moistureChart = moistureData.map((d, i) => ({ ...d, name: dayFmt.format(new Date(2026, 0, 5 + i)) }));

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Top Section: Hero + Weather */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Hero Section */}
        <div className="xl:col-span-2 relative rounded-3xl overflow-hidden shadow-xl min-h-[350px] group">
          <img 
            src="https://images.unsplash.com/photo-1625246333195-58f21a408788?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-green-900/90 via-green-900/40 to-transparent flex items-center p-8 md:p-10">
            <div className="max-w-lg text-white space-y-5">
              <h1 className="text-3xl md:text-5xl font-bold leading-tight">
                {t.welcome} <br/>
                <span className="text-green-300">{user?.name || t.farmer}!</span>
              </h1>
              <div className="flex items-center gap-2 text-green-100 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 w-fit">
                <Sprout size={20} className="text-green-300" />
                <span className="text-sm font-medium">{t.yieldPred}: <span className="text-white font-bold">+12%</span></span>
              </div>
              <p className="text-green-50 text-base md:text-lg opacity-90 max-w-md">
                {t.dashboardHeroDesc}
              </p>
              <button className="bg-white text-green-800 px-8 py-3 rounded-full font-bold hover:bg-green-50 transition-colors shadow-lg hover:shadow-xl translate-y-1">
                {t.fieldReport}
              </button>
            </div>
          </div>
        </div>

        {/* Weather Widget Wrapper */}
        <div id="weather-widget-container" className="xl:col-span-1 h-full min-h-[350px]">
          <WeatherWidget lang={lang} user={user} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t.totalYield} value={`12.4 ${t.unitTons}`} icon={Sprout} color="bg-green-500" trend="+12%" />
        <StatCard title={t.activeFields} value={`8 ${t.unitZones}`} icon={MapIcon} color="bg-blue-500" trend={`+1 ${t.newZone}`} />
        <StatCard title={t.equipStatus} value={`98% ${t.statusGood}`} icon={Tractor} color="bg-orange-500" trend={t.stable} />
        <StatCard title={t.waterUsage} value={`8,000 ${t.unitLitres}`} icon={Droplets} color="bg-cyan-500" trend="-5%" />
      </div>

      {/* Live alerts + service status */}
      <FarmAlertsPanel user={user} lang={lang} />

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg text-gray-800">{t.yieldProj}</h3>
            <button className="p-2 hover:bg-gray-50 rounded-lg"><TrendingUp size={20} className="text-gray-400" /></button>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={yieldChart}>
                <defs>
                  <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-lg text-gray-800">{t.soilMoisture}</h3>
             <div className="flex gap-2 text-sm">
               <span className="flex items-center gap-1 text-gray-500"><div className="w-2 h-2 rounded-full bg-blue-500"></div>{t.thisWeek}</span>
             </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={moistureChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="val" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;