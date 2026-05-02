import { GoogleGenAI } from "@google/genai";

let genAiModels: GoogleGenAI | null = null;

export const resetGeminiModel = (): void => { genAiModels = null; };

export type GeminiModel = GoogleGenAI | "MOCK_MODE";

export const getGeminiModel = (userApiKey?: string): GeminiModel => {
  if (genAiModels && !userApiKey) return genAiModels;

  let apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  apiKey = apiKey.trim();
  
  if (apiKey === "MY_GEMINI_API_KEY") {
      return "MOCK_MODE";
  }

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1' });
  if (!userApiKey) {
      genAiModels = ai;
  }
  return ai;
};
