import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Single platform-level .env lives two folders up (agriqnet-platform/.env).
const ENV_DIR = path.resolve(__dirname, '..', '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, '');
  const api = `http://127.0.0.1:${env.API_PORT || '5000'}`;
  return {
    envDir: ENV_DIR,
    server: {
      port: Number(env.PEST_DASHBOARD_PORT || 3001),
      strictPort: true,
      host: '0.0.0.0',
      proxy: { '/api': { target: api, changeOrigin: true } },
    },
    preview: {
      port: Number(env.PEST_DASHBOARD_PORT || 3001),
      proxy: { '/api': { target: api, changeOrigin: true } },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
