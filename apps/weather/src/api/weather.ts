import { API_CONFIG } from "./config";
import type {
  WeatherData,
  ForecastData,
  GeocodingResponse,
  Coordinates,
  DailyForecast16Data,
} from "./types";

class WeatherAPI {
  private createUrl(endpoint: string, params: Record<string, string | number>) {
    const searchParams = new URLSearchParams({
      appid: API_CONFIG.API_KEY,
      ...params,
    });
    return `${endpoint}?${searchParams.toString()}`;
  }

  private async fetchData<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async getCurrentWeather({ lat, lon }: Coordinates): Promise<WeatherData> {
    const url = this.createUrl(`${API_CONFIG.BASE_URL}/weather`, {
      lat: lat.toString(),
      lon: lon.toString(),
      units: "metric",
    });
    return this.fetchData<WeatherData>(url);
  }

  async getForecast({ lat, lon }: Coordinates): Promise<ForecastData> {
    const url = this.createUrl(`${API_CONFIG.BASE_URL}/forecast`, {
      lat: lat.toString(),
      lon: lon.toString(),
      units: "metric",
    });
    return this.fetchData<ForecastData>(url);
  }

  async reverseGeocode({
    lat,
    lon,
  }: Coordinates): Promise<GeocodingResponse[]> {
    const url = this.createUrl(`${API_CONFIG.GEO}/reverse`, {
      lat: lat.toString(),
      lon: lon.toString(),
      limit: "1",
    });
    return this.fetchData<GeocodingResponse[]>(url);
  }

  async searchLocations(query: string): Promise<GeocodingResponse[]> {
    const url = this.createUrl(`${API_CONFIG.GEO}/direct`, {
      q: query,
      limit: "5",
    });
    return this.fetchData<GeocodingResponse[]>(url);
  }


  // 🌿 16-Day daily forecast.
  // OpenWeather's /forecast/daily needs a paid plan (free keys get HTTP 401, which broke the whole
  // dashboard), so this now uses the free, key-less Open-Meteo API and maps it to the same shape.
  async getDailyForecast16({ lat, lon }: Coordinates): Promise<DailyForecast16Data> {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,sunrise,sunset",
      forecast_days: "16",
      wind_speed_unit: "ms",
      timezone: "auto",
      timeformat: "unixtime",
    });
    const d = await this.fetchData<any>(`https://api.open-meteo.com/v1/forecast?${params}`);
    const daily = d.daily;
    return {
      list: daily.time.map((t: number, i: number) => {
        const code = daily.weather_code[i];
        const w = wmoToWeather(code);
        return {
          dt: t,
          temp: { min: daily.temperature_2m_min[i], max: daily.temperature_2m_max[i] },
          humidity: Math.round(daily.relative_humidity_2m_mean?.[i] ?? 0),
          wind_speed: daily.wind_speed_10m_max?.[i],
          rain: daily.precipitation_sum?.[i] || undefined,
          weather: [{ id: code, main: w.main, description: w.description, icon: w.icon }],
        };
      }),
      city: { name: "", country: "", sunrise: daily.sunrise?.[0] ?? 0, sunset: daily.sunset?.[0] ?? 0, coord: { lat, lon } },
      cnt: daily.time.length,
    };
  }
}

/** WMO weather interpretation codes (Open-Meteo) -> OpenWeather-like fields */
function wmoToWeather(code: number): { main: string; description: string; icon: string } {
  if (code === 0) return { main: "Clear", description: "clear sky", icon: "01d" };
  if (code <= 2) return { main: "Clouds", description: "partly cloudy", icon: "02d" };
  if (code === 3) return { main: "Clouds", description: "overcast clouds", icon: "04d" };
  if (code <= 48) return { main: "Fog", description: "fog", icon: "50d" };
  if (code <= 57) return { main: "Drizzle", description: "drizzle", icon: "09d" };
  if (code <= 67) return { main: "Rain", description: code >= 65 ? "heavy rain" : "rain", icon: "10d" };
  if (code <= 77) return { main: "Snow", description: "snow", icon: "13d" };
  if (code <= 82) return { main: "Rain", description: "rain showers", icon: "09d" };
  if (code <= 86) return { main: "Snow", description: "snow showers", icon: "13d" };
  return { main: "Thunderstorm", description: code >= 96 ? "thunderstorm with hail" : "thunderstorm", icon: "11d" };
}

export const weatherAPI = new WeatherAPI();
