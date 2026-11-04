// AgriQNet API gateway (port 5000 by default)
//   • accounts + OTP + SMS            (was: Agriqnet/AgriQNet/server.js)
//   • pest-alert graph engine         (was: farmer-pest-alert-system/backend)
//   • Gemini proxy                    (was: browser-side geminiService.ts)
//   • proxies to YOLO, recommender, AgriRAG, plus agro-weather alerts
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { isSeeded, seedDatabase, ensureAccounts } from './seed/index.js';
import authRoutes from './routes/auth.js';
import pestRoutes from './routes/pestAlerts.js';
import aiRoutes from './routes/ai.js';
import serviceRoutes from './routes/services.js';
import libraryRoutes from './routes/library.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // base64 images for Gemini vision

app.get('/', (req, res) => res.json({ name: 'AgriQNet API', health: '/api/health' }));
app.use('/api', authRoutes);
app.use('/api', pestRoutes);
app.use('/api', aiRoutes);
app.use('/api', serviceRoutes);
app.use('/api', libraryRoutes); // Farmer Library (AgriRAG)

app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl} ->`, err);
  res.status(status).json({ error: err.message, message: err.message });
});

async function connectWithRetry(uri, tries = 30) {
  for (let i = 1; i <= tries; i++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
      return;
    } catch (e) {
      if (i === tries) throw e;
      if (i === 1 || i % 5 === 0) console.log(`[api] Waiting for MongoDB (${e.message.split('\n')[0]})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const safeUri = config.mongoUri.replace(/\/\/[^@]*@/, '//<credentials>@');
try {
  await connectWithRetry(config.mongoUri);
  console.log(`[api] MongoDB connected: ${safeUri}`);
  if (config.autoSeed && !(await isSeeded())) {
    console.log('[api] Empty database detected — seeding Karnataka districts, farmers, pests and sample alerts…');
    await seedDatabase();
  }
  await ensureAccounts();
} catch (e) {
  console.error(`[api] Could not connect to MongoDB at ${safeUri}: ${e.message}`);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`[api] AgriQNet API listening on http://localhost:${config.port}  (health: /api/health)`);
});
