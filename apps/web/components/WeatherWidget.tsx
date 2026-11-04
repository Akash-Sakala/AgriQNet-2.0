
import React, { useEffect, useState } from 'react';
import { CloudSun, Droplets, Wind, ThermometerSun, MapPin, Loader2, Sun, Cloud, CloudRain, CloudLightning, Snowflake, Search, AlertTriangle } from 'lucide-react';
import { WeatherData, Language, Farmer } from '../types';
import { PlatformService } from '../services/platformService';
import { getTranslation, LOCALES, districtName } from '../utils/translations';

interface WeatherWidgetProps {
  lang: Language;
  user?: Farmer | null;
}

const STORAGE_KEY = 'agriqnet_weather_loc';

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ lang, user }) => {
  const t = getTranslation(lang);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to map WMO codes to animated icons
  const getWeatherIcon = (code: number, size: number = 20) => {
    // Clear Sky (0)
    if (code === 0) 
      return <Sun size={size} className="text-yellow-300 animate-spin" style={{ animationDuration: '10s' }} />;
    
    // Mainly Clear / Partly Cloudy (1-3)
    if (code >= 1 && code <= 3) 
      return <CloudSun size={size} className="text-yellow-100 animate-pulse" style={{ animationDuration: '4s' }} />;
    
    // Fog (45, 48)
    if (code >= 45 && code <= 48) 
      return <Cloud size={size} className="text-gray-300 animate-pulse" style={{ animationDuration: '6s' }} />;
    
    // Rain / Drizzle (51-67, 80-82)
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) 
      return <CloudRain size={size} className="text-blue-200 animate-bounce" style={{ animationDuration: '3s' }} />;
    
    // Snow (71-77, 85, 86)
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) 
      return <Snowflake size={size} className="text-white animate-spin" style={{ animationDuration: '8s' }} />;
    
    // Thunderstorm (95-99)
    if (code >= 95 && code <= 99) 
      return <CloudLightning size={size} className="text-yellow-300 animate-pulse" style={{ animationDuration: '0.5s' }} />;
    
    // Default
    return <CloudSun size={size} className="text-blue-100" />;
  };

  // Helper to map WMO codes to text conditions
  const getWeatherCondition = (code: number) => {
    if (code === 0) return t.wxClear;
    if (code >= 1 && code <= 3) return t.wxPartlyCloudy;
    if (code >= 45 && code <= 48) return t.wxFog;
    if (code >= 51 && code <= 67) return t.wxRain;
    if (code >= 71 && code <= 77) return t.wxSnow;
    if (code >= 80 && code <= 82) return t.wxShowers;
    if (code >= 95 && code <= 99) return t.wxThunder;
    return t.wxCloudy;
  };

  // Helper to detect severe weather based on WMO codes
  const getSevereWeatherAlert = (code: number) => {
    // Thunderstorm (95-99)
    if (code >= 95 && code <= 99) return { title: t.wxAlertThunder, level: 'critical' };
    // Freezing Rain (66, 67)
    if (code === 66 || code === 67) return { title: t.wxAlertFreezing, level: 'warning' };
    // Heavy Snow (73, 75, 85, 86)
    if ([73, 75, 85, 86].includes(code)) return { title: t.wxAlertSnow, level: 'warning' };
    // Violent Rain (82)
    if (code === 82) return { title: t.wxAlertFlood, level: 'critical' };
    
    return null;
  };

  const fetchWeather = async (lat: number, lon: number, locationName: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      
      if (!response.ok) throw new Error("Weather Service Unavailable");

      const data = await response.json();
      
      const forecast = data.daily.time.slice(0, 5).map((t: string, i: number) => ({
        day: new Date(t).toLocaleDateString(LOCALES[lang], { weekday: 'short' }),
        temp: Math.round(data.daily.temperature_2m_max[i]), // High temp for the day
        icon: String(data.daily.weather_code[i]) // Store code as string to parse later
      }));

      setWeather({
        location: locationName,
        temp: Math.round(data.current.temperature_2m),
        condition: getWeatherCondition(data.current.weather_code),
        code: data.current.weather_code,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        forecast: forecast
      });
      setError(null);
      
      // Save successful location to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lon, name: locationName }));

    } catch (err) {
      console.error(err);
      setError(t.wxUnable);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=1&language=${lang}&format=json`);
        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            alert(t.wxNotFound);
            return;
        }

        const location = geoData.results[0];
        const locName = location.country_code ? `${location.name}, ${location.country_code}` : location.name;
        await fetchWeather(location.latitude, location.longitude, locName);
        setSearchQuery('');
    } catch (error) {
        console.error("Search error:", error);
        alert(t.wxSearchFail);
    }
  };

  useEffect(() => {
    // Check localStorage first
    const savedLoc = localStorage.getItem(STORAGE_KEY);
    if (savedLoc) {
        try {
            const { lat, lon, name } = JSON.parse(savedLoc);
            fetchWeather(lat, lon, name);
            return;
        } catch (e) {
            console.warn("Failed to parse saved location", e);
        }
    }

    // Default = the farmer's registered district (then Bengaluru). GPS refines it if allowed.
    const useDistrict = async () => {
      try {
        const ds = await PlatformService.getDistricts();
        const d = ds.find((x) => x.id === user?.districtId)
          || ds.find((x) => user?.location && (x.name.toLowerCase() === user.location.toLowerCase() || (x as any).aliases?.some((a: string) => a.toLowerCase() === user.location.toLowerCase())))
          || ds.find((x) => x.id === 'BNU');
        if (d?.geo) return fetchWeather(d.geo.lat, d.geo.lon, districtName(t, d.id, d.name));
      } catch { /* ignore */ }
      fetchWeather(12.9716, 77.5946, districtName(t, 'BNU', 'Bengaluru'));
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => fetchWeather(position.coords.latitude, position.coords.longitude, t.localField),
        () => useDistrict(),
        { timeout: 6000 }
      );
    } else {
      useDistrict();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl p-6 text-white shadow-xl h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-white/50" size={32} />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl p-6 text-white shadow-xl h-full flex flex-col items-center justify-center relative">
        <CloudSun size={48} className="mb-4 text-white/50" />
        <p className="font-medium">{error || "Weather Unavailable"}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-xs font-bold transition-colors"
        >
          {t.retry}
        </button>
      </div>
    );
  }

  const alertInfo = getSevereWeatherAlert(weather.code);

  return (
    <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-3xl p-6 text-white shadow-xl overflow-hidden relative group h-full flex flex-col">
      {/* Decorative Circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-2xl group-hover:bg-white/30 transition-all duration-700"></div>
      <div className="absolute top-20 -left-10 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>

      {/* Severe Weather Alert Banner */}
      {alertInfo && (
        <div className={`absolute top-0 left-0 right-0 p-3 ${alertInfo.level === 'critical' ? 'bg-red-500' : 'bg-orange-500'} text-white z-30 flex items-center justify-center gap-2 shadow-md`}>
          <div className="flex items-center gap-2 animate-pulse">
            <AlertTriangle size={18} fill="currentColor" className="text-white" />
            <span className="text-sm font-bold uppercase tracking-wider">{alertInfo.title}</span>
          </div>
        </div>
      )}

      {/* Search Bar - Shifts down if alert is present */}
      <form onSubmit={handleSearch} className={`absolute ${alertInfo ? 'top-14' : 'top-4'} right-4 z-20 flex items-center shadow-lg rounded-full transition-all duration-300`}>
         <input 
            type="text" 
            placeholder={t.searchCity}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-24 focus:w-36 transition-all duration-300 bg-white/20 backdrop-blur-md text-white placeholder-white/60 text-xs rounded-l-full px-3 py-1.5 outline-none border border-white/20 border-r-0"
         />
         <button type="submit" className="bg-white/20 backdrop-blur-md text-white rounded-r-full px-2 py-1.5 hover:bg-white/30 border border-white/20 border-l-0 flex items-center justify-center">
            <Search size={14} />
         </button>
      </form>

      <div className={`relative z-10 flex justify-between items-start ${alertInfo ? 'mt-8' : 'mt-4'} transition-all`}>
        <div>
          <h3 className="text-blue-100 font-medium flex items-center gap-2">
            <MapPin size={16} className="text-blue-200" />
            {weather.location}
          </h3>
          <div className="mt-2">
            <h1 className="text-5xl font-bold tracking-tighter">{weather.temp}°</h1>
            <p className="text-blue-100 mt-1 font-medium text-lg">{weather.condition}</p>
          </div>
        </div>
        <div className="text-blue-100/90 bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/10 shadow-inner transition-transform hover:scale-105 duration-300 mt-6">
           {getWeatherIcon(weather.code, 48)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/10">
        <div className="flex flex-col items-center">
          <Droplets size={20} className="mb-1 text-blue-200" />
          <span className="text-sm font-semibold">{weather.humidity}%</span>
          <span className="text-xs text-blue-200">{t.humidity}</span>
        </div>
        <div className="flex flex-col items-center border-l border-white/20">
          <Wind size={20} className="mb-1 text-blue-200" />
          <span className="text-sm font-semibold">{weather.windSpeed} <span className="text-[10px]">{t.kmh}</span></span>
          <span className="text-xs text-blue-200">{t.wind}</span>
        </div>
        <div className="flex flex-col items-center border-l border-white/20">
          <ThermometerSun size={20} className="mb-1 text-blue-200" />
          <span className="text-sm font-semibold">{t.uvHigh}</span>
          <span className="text-xs text-blue-200">{t.uvIndex}</span>
        </div>
      </div>

      <div className="mt-auto pt-6">
        <h4 className="text-sm font-medium text-blue-100 mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-300"></span>
          {t.forecast}
        </h4>
        <div className="flex justify-between items-center text-center">
          {weather.forecast.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5 hover:bg-white/5 p-1 rounded-lg transition-colors cursor-default group/day">
              <span className="text-xs text-blue-200 font-medium">{day.day}</span>
              <div className="my-1 text-white transform group-hover/day:scale-110 transition-transform">
                {getWeatherIcon(parseInt(day.icon), 20)}
              </div>
              <span className="text-sm font-bold">{day.temp}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeatherWidget;
