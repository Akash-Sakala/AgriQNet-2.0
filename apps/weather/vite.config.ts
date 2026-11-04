import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Single platform-level .env lives two folders up (agriqnet-platform/.env).
const ENV_DIR = path.resolve(__dirname, "..", "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ENV_DIR, "");
  const api = `http://127.0.0.1:${env.API_PORT || "5000"}`;
  return {
    envDir: ENV_DIR,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 800,
    },
    server: {
      host: true,
      port: Number(env.WEATHER_PORT || 5175),
      strictPort: true,
      proxy: { "/api": { target: api, changeOrigin: true } },
    },
    preview: {
      port: Number(env.WEATHER_PORT || 5175),
      proxy: { "/api": { target: api, changeOrigin: true } },
    },
  };
});
