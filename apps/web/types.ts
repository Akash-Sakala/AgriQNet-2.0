

export type NavView = 'home' | 'weather' | 'crops' | 'fertilizer' | 'pest_check' | 'alerts' | 'chat' | 'library' | 'network';

export type Language = 'en' | 'hi' | 'kn' | 'te';

export interface Farmer {
  id: string;
  name: string;
  location: string;
  phone: string;
  districtId?: string | null; // matched Karnataka district id, e.g. "MYS"
  lang?: Language;
  role?: 'farmer' | 'officer';
  crops?: string[];
  token?: string; // signed session token (officer actions)
  password?: string; // only sent on registration; never stored client-side
}

export interface WeatherData {
  temp: number;
  condition: string;
  code: number;
  humidity: number;
  windSpeed: number;
  location: string;
  forecast: Array<{ day: string; temp: number; icon: string }>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface SoilData {
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  ph: number;
  rainfall: number;
}

export interface CropRecommendation {
  name: string;
  scientificName: string;
  confidence: number;
  description: string;
  imageUrl: string;
  requirements: {
    water: string;
    sun: string;
    soil: string;
  };
  growthPeriod: string;
  yieldPotential: string;
  economicAnalysis: string;
}

export interface PestAnalysisResult {
  pestName: string;
  confidence: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  treatments: string[];
  preventions: string[];
}

export interface FertilizerPlan {
  name: string;
  description: string;
  applicationFrequency: string;
  dosage: string;
  warnings: string[];
}