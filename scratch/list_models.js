import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

async function list() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    return;
  }
  const genAI = new GoogleGenAI(apiKey);
  try {
      // The current SDK might have a different method to list models
      // or we can just try gemini-2.0-flash
      console.log("Attempting to list models or test gemini-2.0-flash...");
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      console.log("Model initialized (2.0)");
  } catch (e) {
      console.error(e);
  }
}
list();
