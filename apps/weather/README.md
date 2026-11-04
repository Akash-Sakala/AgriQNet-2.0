# AgriQNet Weather Station

React + Vite + TanStack Query + shadcn/ui. Runs on port 5175 through the platform launcher, and is embedded in the main app's *Weather Station* tab.

- Current weather and the 5-day forecast come from OpenWeather (`VITE_OPENWEATHER_API_KEY` in the platform `.env`).
- The 16-day agriculture forecast comes from Open-Meteo, which is free and needs no key. OpenWeather's `/forecast/daily` requires a paid plan.
- Farm weather alerts come from `/api/weather/alerts`: heavy rain, heat, wind, thunderstorms, disease risk and dry spells.
- The AI advisor uses `/api/ai/weather-advice`, which calls Gemini on the server.
