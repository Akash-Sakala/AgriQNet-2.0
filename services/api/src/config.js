// Central configuration for the AgriQNet API.
// Loads the single platform-level .env (agriqnet-platform/.env), then any service-local .env.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const API_ROOT = path.resolve(__dirname, '..');
export const PLATFORM_ROOT = path.resolve(API_ROOT, '..', '..');

dotenv.config({ path: path.join(PLATFORM_ROOT, '.env') });
dotenv.config({ path: path.join(API_ROOT, '.env') });

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const int = (k, d) => Number.parseInt(env(k, d), 10);

/** Runtime folder that holds DB files, venv and caches — kept OUT of OneDrive by default. */
export function runtimeHome() {
  if (process.env.AGRIQNET_HOME) return process.env.AGRIQNET_HOME;
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AgriQNet');
  }
  return path.join(os.homedir(), '.agriqnet');
}

const MONGO_PORT = int('MONGO_PORT', 27017);

export const config = {
  port: int('API_PORT', 5000),
  mongoUri: env('MONGO_URI', `mongodb://127.0.0.1:${MONGO_PORT}/agriqnet`),
  mongoPort: MONGO_PORT,
  autoSeed: env('AUTO_SEED', 'true') !== 'false',

  services: {
    pestDetector: env('PEST_DETECTOR_URL', `http://127.0.0.1:${int('PEST_DETECTOR_PORT', 8001)}`),
    recommender: env('RECOMMENDER_URL', `http://127.0.0.1:${int('RECOMMENDER_PORT', 8002)}`),
    rag: env('RAG_URL', `http://127.0.0.1:${int('RAG_PORT', 8003)}`),
  },
  // Optional hosted fallbacks (used only when the local service is unreachable)
  fallbacks: {
    recommender: ['none', 'off', 'false'].includes(String(env('RECOMMENDER_FALLBACK_URL', '')).toLowerCase())
      ? ''
      : env('RECOMMENDER_FALLBACK_URL', 'https://agro-backend-ns2o.onrender.com'),
  },

  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    model: env('GEMINI_MODEL', 'gemini-3.5-flash'),
  },
  // Text-only fallback when Gemini is over quota (free tier ≈ 20 requests/day/model)
  groq: {
    apiKey: env('GROQ_API_KEY', ''),
    model: env('GROQ_MODEL', 'openai/gpt-oss-120b'),
  },

  sms: {
    // auto: real Twilio if credentials exist, fall back to simulation on failure
    // twilio: real only (errors surface) | simulate: never send real SMS
    mode: env('SMS_MODE', 'auto'),
    accountSid: env('TWILIO_ACCOUNT_SID', env('ACCOUNT_SID', '')),
    authToken: env('TWILIO_AUTH_TOKEN', env('AUTH_TOKEN', '')),
    from: env('TWILIO_FROM_NUMBER', env('FROM_NUMBER', '')),
  },

  otp: {
    ttlMinutes: int('OTP_TTL_MINUTES', 10),
    requireForSignup: env('REQUIRE_OTP_FOR_SIGNUP', 'true') !== 'false',
  },
};
