import { GoogleGenAI } from "@google/genai";

let genAiModels: any = null;

export const getGeminiModel = () => {
  if (genAiModels) return genAiModels;

  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  apiKey = apiKey.trim();
  
  if (apiKey === "MY_GEMINI_API_KEY") {
      throw new Error('Please configure a valid GEMINI_API_KEY in the Secrets menu. The current key is a placeholder.');
  }

  genAiModels = new GoogleGenAI({ apiKey }).models;
  return genAiModels;
};
