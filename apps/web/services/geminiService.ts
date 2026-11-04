import { PestAnalysisResult, CropRecommendation, FertilizerPlan, Language } from "../types";
import { api } from "./config";

/**
 * Gemini calls now go through the AgriQNet API (/api/ai/*) so the API key is no longer
 * bundled into the browser. Function signatures are unchanged for the components.
 */
export const GeminiService = {
  async chat(message: string, history: { role: string; parts: { text: string }[] }[] = [], lang: Language = 'en', farm?: { districtId?: string | null; crops?: string[] }): Promise<string> {
    try {
      const r = await api<{ text: string }>('/ai/chat', { method: 'POST', json: { message, history, lang, districtId: farm?.districtId, crops: farm?.crops } });
      return r.text;
    } catch (error) {
      console.error("Chat Error:", error);
      return "Sorry, I'm having trouble connecting to the AgriQNet AI service right now.";
    }
  },

  /** input: a full prompt string, a soil-data object, or the GenAI form object */
  async recommendCrops(input: any, lang: Language = 'en', farm?: { districtId?: string | null; crops?: string[] }): Promise<CropRecommendation[]> {
    return api<CropRecommendation[]>('/ai/crops', { method: 'POST', json: { input, lang, districtId: farm?.districtId, crops: farm?.crops } });
  },

  async analyzePestImage(base64Image: string, lang: Language = 'en', mimeType = 'image/jpeg', hint?: string): Promise<PestAnalysisResult> {
    return api<PestAnalysisResult>('/ai/pest-image', { method: 'POST', json: { imageBase64: base64Image, mimeType, lang, hint } });
  },

  async pestAdvice(pestName: string, crop?: string, lang: Language = 'en'): Promise<Omit<PestAnalysisResult, 'confidence'>> {
    return api('/ai/pest-advice', { method: 'POST', json: { pestName, crop, lang } });
  },

  async recommendFertilizer(cropName: string, soilCondition: string, lang: Language = 'en', farm?: { districtId?: string | null; crops?: string[] }): Promise<FertilizerPlan[]> {
    return api<FertilizerPlan[]>('/ai/fertilizer', { method: 'POST', json: { crop: cropName, soil: soilCondition, lang, districtId: farm?.districtId, crops: farm?.crops } });
  },
};
