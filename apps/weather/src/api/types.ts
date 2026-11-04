export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GeocodingResponse {
  name: string;
  local_names?: Record<string, string>;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

export interface WeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface WeatherData {
  coord: Coordinates;
  weather: WeatherCondition[];
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
  };
  wind: {
    speed: number;
    deg: number;
  };
  sys: {
    sunrise: number;
    sunset: number;
    country: string;
  };
  name: string;
  dt: number;
  visibility: number;
}

export interface ForecastData {
  list: Array<{
    dt: number;
    main: WeatherData["main"];
    weather: WeatherData["weather"];
    wind: WeatherData["wind"];
    dt_txt: string;
  }>;
  city: {
    name: string;
    country: string;
    sunrise: number;
    sunset: number;
  };
  cnt?: number;
}

export interface DailyForecast16Data {
  list: Array<{
    dt: number;
    temp: {
      min: number;
      max: number;
      day?: number;
      night?: number;
    };
    humidity: number;
    wind_speed?: number;
    rain?: number;
    weather: {
      id: number;
      main: string;
      description: string;
      icon: string;
    }[];
  }>;

  city: {
    name: string;
    country: string;
    sunrise: number;
    sunset: number;
    coord?: Coordinates; // ⚠ required to fix build
  };

  cnt?: number; // prevent TS error about missing field
}

