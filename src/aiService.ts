import { GoogleGenAI } from "@google/genai";

let genAiModels: GoogleGenAI | null = null;

export const resetGeminiModel = (): void => { genAiModels = null; };

export type GeminiModel = GoogleGenAI | "MOCK_MODE";

export type NimMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const generateNimChatCompletion = async (messages: NimMessage[]): Promise<string> => {
  const apiKey = process.env.NVIDIA_NIM_API_KEY?.trim();
  if (!apiKey) throw new Error('NVIDIA_NIM_API_KEY environment variable is required');

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.NVIDIA_NIM_MODEL?.trim() || 'meta/llama-3.1-8b-instruct',
      messages,
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`NVIDIA NIM request failed with status ${response.status}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('NVIDIA NIM returned no assistant content');
  return content;
};

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
