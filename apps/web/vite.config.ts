import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Single platform-level .env lives two folders up (agriqnet-platform/.env).
const ENV_DIR = path.resolve(__dirname, '..', '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const apiPort = env.API_PORT || '5000';
  return {
    envDir: ENV_DIR,
    server: {
      port: Number(env.WEB_PORT || 3000),
      strictPort: true,
      host: '0.0.0.0',
      // pest-name translations are shared with the API (services/api/src/i18n)
      fs: { allow: [ENV_DIR] },
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      },
    },
    preview: {
      port: Number(env.WEB_PORT || 3000),
      proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
    },
    plugins: [react()],
    // NOTE: GEMINI_API_KEY is no longer injected into the browser bundle — the API proxies Gemini.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared-i18n': path.resolve(ENV_DIR, 'services', 'api', 'src', 'i18n'),
      },
    },
  };
});
