import { GoogleGenAI } from "@google/genai";

let genAiModels: any = null;

export const resetGeminiModel = () => { genAiModels = null; };

export const getGeminiModel = (userApiKey?: string) => {
  if (genAiModels && !userApiKey) return genAiModels;

  let apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  apiKey = apiKey.trim();
  
  if (apiKey === "MY_GEMINI_API_KEY") {
      return "MOCK_MODE";
  }

  const ai = new GoogleGenAI({ apiKey });
  if (!userApiKey) {
      genAiModels = ai;
  }
  return ai;
};
