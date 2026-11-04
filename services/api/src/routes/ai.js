// Gemini endpoints used by the main app and the weather app (key stays on the server).
import { Router } from 'express';
import * as gemini from '../lib/gemini.js';
import { ah } from '../lib/http.js';
import { createHash } from 'node:crypto';
import { District, Advice } from '../models/index.js';
import { seasonOf } from '../lib/advice.js';

/** One line describing the farmer (district, season, crops) so AI answers are local. */
async function farmerContext({ districtId, crops }) {
  const d = districtId ? await District.findOne({ id: districtId }).lean() : null;
  if (!d) return '';
  const { month, season } = seasonOf(new Date());
  return `district ${d.name}, Karnataka; ${month}, ${season} season; grows ${(crops || []).join(', ') || 'unknown'}; common local crops ${d.majorCrops.join(', ')}.`;
}

const router = Router();

router.post('/ai/chat', ah(async (req, res) => {
  const { message, history = [], lang = 'en' } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  const ctx = await farmerContext(req.body);
  res.json({ text: await gemini.chat(message, history, lang, ctx) });
}));

router.post('/ai/translate', ah(async (req, res) => {
  const { data, lang = 'en' } = req.body;
  if (data === undefined) return res.status(400).json({ error: 'data is required' });
  if (lang === 'en') return res.json({ data });
  // Same content + language → same translation, so switching languages back and forth is instant.
  const key = `tr|${lang}|${createHash('sha1').update(JSON.stringify(data)).digest('hex')}`;
  const hit = await Advice.findOne({ key }).lean();
  if (hit) return res.json({ data: hit.data, cached: true });
  const out = await gemini.translateJson(data, lang);
  await Advice.updateOne({ key }, { $set: { data: out, createdAt: new Date() } }, { upsert: true });
  res.json({ data: out });
}));

router.post('/ai/crops', ah(async (req, res) => {
  const ctx = await farmerContext(req.body);
  let input = req.body.input ?? req.body.prompt;
  if (ctx && typeof input === 'string') input += `\nFARMER: ${ctx}`;
  res.json(await gemini.recommendCrops(input, req.body.lang));
}));

router.post('/ai/pest-image', ah(async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', lang = 'en', hint } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  res.json(await gemini.analyzePestImage(imageBase64, mimeType, lang, hint));
}));

router.post('/ai/pest-advice', ah(async (req, res) => {
  const { pestName, crop, lang = 'en' } = req.body;
  if (!pestName) return res.status(400).json({ error: 'pestName is required' });
  res.json(await gemini.pestAdvice(pestName, crop, lang));
}));

router.post('/ai/fertilizer', ah(async (req, res) => {
  const { crop, soil, lang = 'en' } = req.body;
  res.json(await gemini.recommendFertilizer(crop, soil, lang, await farmerContext(req.body)));
}));

router.post('/ai/weather-advice', ah(async (req, res) => {
  res.json({ text: await gemini.weatherAdvice(req.body.type, req.body.weather) });
}));

export default router;
