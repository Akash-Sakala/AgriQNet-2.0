// Server-side Gemini calls (moved out of the browser so the API key is never shipped to clients).
import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';

export const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', kn: 'Kannada', te: 'Telugu', ta: 'Tamil', mr: 'Marathi' };
const langName = (code) => LANGUAGE_NAMES[code] || 'English';

let ai = null;
function client() {
  if (!config.gemini.apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not set in agriqnet-platform/.env'), { status: 503 });
  }
  if (!ai) ai = new GoogleGenAI({ apiKey: config.gemini.apiKey, httpOptions: { timeout: CALL_TIMEOUT_MS } });
  return ai;
}
const MODEL = () => config.gemini.model;
const CALL_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 20000);

// Gemini models get retired / overloaded (503 "high demand", 404 "no longer available").
// Try the configured model first, then fall back so farmers still get an answer.
const FALLBACKS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
const RETRYABLE = /\b(429|500|503|504|404)\b|DEADLINE_EXCEEDED|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|no longer available/i;
// Models that just failed are skipped for a while (quota 429 → 15 min, overload/timeout → 2 min),
// so farmers don't wait for the same failing model on every request.
const cooldown = new Map();

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(`timeout after ${ms} ms`), { status: 503 })), ms))]);

async function withModels(run, groqFallback) {
  const models = config.gemini.apiKey ? [...new Set([MODEL(), ...FALLBACKS])].filter((m) => (cooldown.get(m) || 0) < Date.now()) : [];
  let lastErr = new Error(config.gemini.apiKey ? 'All Gemini models are cooling down' : 'GEMINI_API_KEY is not set');
  for (const model of models) {
    try {
      return await withTimeout(run(model), CALL_TIMEOUT_MS);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.status || '') + ' ' + String(e?.message || e);
      if (!RETRYABLE.test(msg) && !/timeout/i.test(msg)) throw e;
      cooldown.set(model, Date.now() + (/429|RESOURCE_EXHAUSTED|quota/i.test(msg) ? 15 : 2) * 60000);
      console.warn(`[gemini] ${model} unavailable (${String(e?.message || e).split('\n')[0].slice(0, 90)}), trying next`);
      // A slow model means Gemini is overloaded right now: don't make the farmer wait for every model.
      if (/timeout|504|DEADLINE/i.test(msg) && groqFallback && config.groq.apiKey) break;
    }
  }
  if (groqFallback && config.groq.apiKey) {
    if (models.length) console.warn('[gemini] all Gemini models unavailable -> using Groq');
    return withTimeout(groqFallback(), CALL_TIMEOUT_MS + 15000);
  }
  throw Object.assign(lastErr, { status: 503 });
}

/** OpenAI-compatible Groq call (text only). */
async function groq(messages, json = false) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      signal: AbortSignal.timeout(35000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groq.apiKey}` },
      // JSON is requested in the prompt and extracted leniently (strict json_object mode fails on long non-English text)
      body: JSON.stringify({ model: config.groq.model, temperature: 0.3, messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      if (attempt === 2) throw Object.assign(new Error(data?.error?.message || `Groq HTTP ${r.status}`), { status: 503 });
      continue;
    }
    const content = data.choices?.[0]?.message?.content || '';
    if (!json) return content;
    const m = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const raw = m[1].trim();
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    try { return JSON.stringify(JSON.parse(raw.slice(start, end + 1))); } catch { /* retry */ }
  }
  throw Object.assign(new Error('Groq returned invalid JSON'), { status: 503 });
}

/** JSON-schema (Gemini Type) -> compact example the Groq model can follow. */
function schemaExample(sc) {
  if (!sc) return null;
  if (sc.type === Type.ARRAY) return [schemaExample(sc.items)];
  if (sc.type === Type.OBJECT) return Object.fromEntries(Object.entries(sc.properties || {}).map(([k, v]) => [k, schemaExample(v)]));
  return sc.enum ? sc.enum.join('|') : (sc.description || sc.type);
}

async function generateJson(contents, schema) {
  const textOnly = typeof contents === 'string';
  const res = await withModels(
    (model) => client().models.generateContent({
      model,
      contents,
      config: { responseMimeType: 'application/json', responseSchema: schema },
    }),
    textOnly ? async () => {
      const isArray = schema.type === Type.ARRAY;
      const out = await groq([{ role: 'user', content: `${contents}\n\nReturn ONLY JSON shaped like ${JSON.stringify(isArray ? { items: schemaExample(schema) } : schemaExample(schema))}` }], true);
      const parsed = JSON.parse(out);
      return { text: JSON.stringify(isArray ? (parsed.items || Object.values(parsed)[0] || []) : parsed) };
    } : undefined
  );
  if (!res.text) throw new Error('Empty response from Gemini');
  return JSON.parse(res.text);
}

export async function chat(message, history = [], lang = 'en', farmerContext = '') {
  // Gemini chat history must start with a user turn: drop the greeting bubble(s)
  const hist = (history || []).filter((h) => h?.parts?.[0]?.text);
  while (hist.length && hist[0].role !== 'user') hist.shift();
  return withModels(async (model) => {
  const session = client().chats.create({
    model,
    config: {
      systemInstruction: `You are AgriQNet, an advanced agricultural AI assistant for Indian (especially Karnataka) farmers.
Respond strictly in the ${langName(lang)} language.
Guidelines:
1. Format your response using Markdown. Use bold for key terms, lists for steps, and clear headings.
2. If the user asks for a process (e.g. 'how to grow corn'), provide a structured step-by-step workflow.
3. Keep answers short (under 150 words), practical and encouraging, in simple everyday words.
4. Make advice specific to the farmer's district, season and crops below; name local inputs and the Raitha Samparka Kendra when useful.
${farmerContext ? `Farmer: ${farmerContext}` : ''}`,
    },
    history: hist.map((h) => ({ role: h.role, parts: h.parts })),
  });
  const result = await session.sendMessage({ message });
  return result.text || "I couldn't generate a response. Please try again.";
  }, () => groq([
    { role: 'system', content: `You are AgriQNet, an agricultural assistant for Indian (Karnataka) farmers. Reply only in ${langName(lang)}, in Markdown, short (under 150 words), practical, simple words, specific to the farmer's district and season. ${farmerContext ? `Farmer: ${farmerContext}` : ''}` },
    ...hist.map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text })),
    { role: 'user', content: message },
  ]));
}

const CROP_SCHEMA = (L) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: `Crop name in ${L}` },
      englishName: { type: Type.STRING, description: 'Common English crop name, lowercase (e.g. rice, maize, ragi), used to pick a photo' },
      scientificName: { type: Type.STRING },
      confidence: { type: Type.NUMBER, description: 'Percentage match 0-100' },
      description: { type: Type.STRING, description: `Why this crop fits, in ${L}` },
      imageUrl: { type: Type.STRING, description: 'Leave empty, handled by frontend' },
      requirements: {
        type: Type.OBJECT,
        properties: {
          water: { type: Type.STRING, description: `Water needs in ${L}` },
          sun: { type: Type.STRING, description: `Sun needs in ${L}` },
          soil: { type: Type.STRING, description: `Soil needs in ${L}` },
        },
      },
      growthPeriod: { type: Type.STRING, description: `e.g. 90-120 days, in ${L}` },
      yieldPotential: { type: Type.STRING, description: `e.g. 4-5 tons/hectare, in ${L}` },
      economicAnalysis: { type: Type.STRING, description: `Short profitability analysis in ${L}` },
    },
  },
});

/** input may be a ready-made prompt string, a soil object (nitrogen…), or a GenAI-form object. */
export async function recommendCrops(input, lang = 'en') {
  const L = langName(lang);
  let prompt;
  if (typeof input === 'string') {
    prompt = input;
  } else if (input && input.nitrogen !== undefined) {
    prompt = `Based on the following soil conditions, recommend the top 3 best suitable crops.
Conditions: Nitrogen: ${input.nitrogen}, Phosphorus: ${input.phosphorus}, Potassium: ${input.potassium}, pH: ${input.ph}, Rainfall: ${input.rainfall}mm.`;
  } else {
    prompt = `Recommend the top 3 best suitable crops for a farm with these details:
Location: ${input?.location}
Soil Type: ${input?.soilType}
Water Source: ${input?.waterSource}
Field Size: ${input?.fieldSize}
Current Date: ${input?.date || new Date().toDateString()} (use this to determine the season)
Focus on crops that are profitable and suitable for this specific season and region.`;
  }
  prompt += `

For each crop provide scientific name, growth period, yield potential and economic analysis.
IMPORTANT: Write every text value in ${L} (simple words a farmer understands), except "englishName" which stays in English.
Keep the JSON property keys exactly as in the schema. Return a JSON array.`;
  return generateJson(prompt, CROP_SCHEMA(L));
}

export async function analyzePestImage(base64Image, mimeType = 'image/jpeg', lang = 'en', hint) {
  const L = langName(lang);
  const prompt = `Analyze this image. If it contains a plant pest or disease, identify it, estimate severity and provide treatments.${
    hint ? ` A YOLO detector trained on the IP102 dataset suggests: "${hint}" — confirm or correct it.` : ''
  } If no pest is found, say so in pestName.
IMPORTANT: Provide all text in ${L}. Keep JSON keys in English.`;
  return generateJson(
    { parts: [{ inlineData: { mimeType, data: base64Image } }, { text: prompt }] },
    {
      type: Type.OBJECT,
      properties: {
        pestName: { type: Type.STRING, description: `Name in ${L}` },
        confidence: { type: Type.NUMBER, description: '0-1' },
        severity: { type: Type.STRING, enum: ['Low', 'Medium', 'High', 'Critical'] },
        description: { type: Type.STRING, description: `Description in ${L}` },
        treatments: { type: Type.ARRAY, items: { type: Type.STRING } },
        preventions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    }
  );
}

/** Text-only advice for a pest already identified by the YOLO model. */
export async function pestAdvice(pestName, crop, lang = 'en') {
  const L = langName(lang);
  return generateJson(
    `A farmer in Karnataka, India has the pest "${pestName}"${crop ? ` on ${crop}` : ''}. Give a 2-sentence description of the damage, a severity estimate, 4 treatments (home remedies and bio-control first, e.g. neem oil, then one chemical sold in Karnataka shops with dose per litre of water or per acre) and 3 preventions.
Write for a farmer with little schooling: very simple everyday words, short sentences (max 20 words each), no scientific or Latin names. Write all text in ${L}; keep JSON keys in English.`,
    {
      type: Type.OBJECT,
      properties: {
        pestName: { type: Type.STRING },
        severity: { type: Type.STRING, enum: ['Low', 'Medium', 'High', 'Critical'] },
        description: { type: Type.STRING },
        treatments: { type: Type.ARRAY, items: { type: Type.STRING } },
        preventions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    }
  );
}

export async function recommendFertilizer(cropName, soilCondition, lang = 'en', farmerContext = '') {
  const L = langName(lang);
  return generateJson(
    `Recommend 2 fertilizer plans for growing ${cropName} in ${soilCondition} soil.${farmerContext ? ` Farm: ${farmerContext} Fit the plan to this district and season.` : ''}
Give doses per acre using fertilizers sold in Karnataka (Urea, DAP, MOP, 10-26-26, compost, FYM, neem cake). One plan organic, one using fertilizer from the shop.
Use very simple words a farmer understands; short sentences.
IMPORTANT: Provide all text content (names, descriptions, dosage) in ${L}. Keep JSON keys in English.`,
    {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          applicationFrequency: { type: Type.STRING },
          dosage: { type: Type.STRING },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    }
  );
}

/** Weather app: 6 bullet farm advisory for a weather snapshot. */
export async function weatherAdvice(type, w, lang = 'en') {
  const prompt = `You are an agricultural expert for Karnataka farmers. Respond with 6 short bullet points only, written in ${langName(lang)} using simple everyday words.
Advisory task: ${type}
Weather inputs:
- Temperature: ${w?.temp}°C
- Humidity: ${w?.humidity}%
- Wind speed: ${w?.wind} m/s
- Pressure: ${w?.pressure} hPa
- Visibility: ${w?.vis}
- Next days rain trend: ${w?.rain}
Return a practical farm recommendation. Avoid generic text.`;
  const res = await withModels((model) => client().models.generateContent({ model, contents: prompt }), async () => ({ text: await groq([{ role: 'user', content: prompt }]) }));
  return res.text || '';
}

/** Used by the RAG fallback when Groq is unavailable. */
export async function summarize(query, context, lang = 'en') {
  const res = await withModels((model) => client().models.generateContent({
    model,
    contents: `Answer the farmer's question in ${langName(lang)} using ONLY the context from agronomy manuals. If the context is insufficient, say so.\n\nQuestion: ${query}\n\nContext:\n${context}`,
  }));
  return res.text || '';
}


/**
 * "This week for your district" — 3 to 4 short, local, actionable tips with an emoji picture each.
 * ctx = { district, crops, season, month, weather, pests }
 */
export async function districtAdvice(ctx, lang = 'en') {
  const L = langName(lang);
  const prompt = `You advise small farmers in ${ctx.district} district, Karnataka, India.
Month: ${ctx.month} (${ctx.season} season). Farmer's crops: ${ctx.crops.join(', ') || 'not given'}; common crops here: ${ctx.majorCrops.join(', ')}.
Next 7 days weather: ${ctx.weather}.
Pest alerts reaching this district now: ${ctx.pests.join('; ') || 'none'}.
Write 3 or 4 tips for THIS week. Each tip: a topic (one of: sowing, water, weather, pest, disease, fertilizer, harvest), an emoji picture, a title of max 5 words, and one or two short sentences of plain advice.
Be concrete for this district and season (e.g. what to sow, irrigate, spray or watch for). No generic advice.
Write all text in ${L}, using simple everyday words a farmer understands. Also give a one-line headline.`;
  const out = await generateJson(prompt, {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      tips: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING, enum: ['sowing', 'water', 'weather', 'pest', 'disease', 'fertilizer', 'harvest'] },
            icon: { type: Type.STRING, description: 'one emoji' },
            title: { type: Type.STRING },
            text: { type: Type.STRING },
          },
        },
      },
    },
  });
  return cleanAdvice(out);
}

/** Models sometimes leak their own notes into fields — keep only short, clean text. */
function clip(text, maxWords, maxChars) {
  let t = String(text || '').split(/\s(?:Target|Context|Note|Output|Ensure)\s*:/)[0].replace(/\s+/g, ' ').trim();
  const words = t.split(' ');
  if (words.length > maxWords) t = words.slice(0, maxWords).join(' ');
  return t.length > maxChars ? `${t.slice(0, maxChars).replace(/\s\S*$/, '')}…` : t;
}
function cleanAdvice(a) {
  const tips = (Array.isArray(a?.tips) ? a.tips : []).slice(0, 4).map((t) => ({
    topic: ['sowing', 'water', 'weather', 'pest', 'disease', 'fertilizer', 'harvest'].includes(t.topic) ? t.topic : 'sowing',
    icon: [...String(t.icon || '🌱')].slice(0, 2).join(''),
    title: clip(t.title, 7, 60),
    text: clip(t.text, 45, 260),
  })).filter((t) => t.title && t.text);
  if (!tips.length) throw Object.assign(new Error('Advice generation failed'), { status: 503 });
  return { headline: clip(a.headline, 14, 110), tips };
}

/** Translate the string values of any JSON value into the target language (keys unchanged). */
export async function translateJson(data, lang = 'en') {
  const L = langName(lang);
  const prompt = `Translate every human-readable string value in this JSON into ${L}, using simple everyday words a farmer understands.
Keep all keys, numbers, emoji, units and the value of any key named "englishName", "scientificName", "id" or "key" unchanged.
Crop, fertilizer and pest names must be the usual local name for that exact thing (e.g. Ragi = finger millet); if unsure, write the English name in ${L} script. Return only the JSON.

${JSON.stringify(data)}`;
  const res = await withModels(
    (model) => client().models.generateContent({ model, contents: prompt, config: { responseMimeType: 'application/json' } }),
    async () => ({ text: await groq([{ role: 'user', content: prompt }], true) })
  );
  return JSON.parse(res.text);
}
