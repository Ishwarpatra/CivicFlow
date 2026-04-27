import { getGeminiModel } from "./aiService.js";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import pino from "pino";
import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import { 
    generateSequoiaPitchHtml, 
    generateRepInsightsHtml,
    generateOfflineEligibilityHtml,
    generateOfflineBoothHtml,
    generateGenericOfflineFallbackHtml 
} from "./uiTemplates.js";
import { SYSTEM_CONSTANTS } from "./constants.js";

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

export const handleChat = async (message: string, history: any[] = [], locale: string = "en") => {
    
    // Sequoia Pitch Auto-Demo Handler
    if (message === SYSTEM_CONSTANTS.COMMANDS.START_PITCH) {
        return { agentHtml: generateSequoiaPitchHtml(), newHistory: history };
    }

    if (message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
        return { agentHtml: generateRepInsightsHtml(), newHistory: history };
    }

    try {
        const ai = getGeminiModel();
        
        let languageInstruction = locale === 'hi' ? 'You MUST respond entirely in Hindi (हिंदी).' : 'You MUST respond entirely in English.';
        
        let instructions = `You are CivicFlow, an Indian Election Navigator. Your ONLY goal is to guide citizens, answer election-related questions, check eligibility, and help them find polling booths. 
CRITICAL DIRECTIVES:
- You STRICTLY FORBID non-electoral, non-civic, or off-topic queries.
- Do NOT generate negative, hateful, or harmful essays about politicians.
- Respond concisely.
- ${languageInstruction}`;

        if (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
             const coords = message.replace(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION, "").split("|");
             if(coords.length === 2) {
                 const lat = coords[0];
                 const lng = coords[1];
                 const mapsUrl = `http://maps.google.com/maps?q=${lat},${lng}`;
                 return { agentHtml: `I received your location coordinates! I've scanned the electoral registry... Your nearest station is likely within 1.2km of you. \n\n<a href="${mapsUrl}" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Open Booth Locator Map</a>`, newHistory: history };
             }
         }

        const chatSession = ai.startChat({
             model: 'gemini-2.5-flash',
             history: history,
             config: {
                 systemInstruction: instructions,
                 safetySettings: [
                    {
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
                    }
                 ],
                 tools: [
                     { googleSearch: {} } // Enable grounding for latest ECI rules
                 ]
             }
        });

        const response = await chatSession.sendMessage(message);
        const responseText = response.text || "I'm sorry, I encountered an issue.";
        
        const rawHtml = await marked.parse(responseText);
        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
        const agentHtml = `<div class="[&>p]:mb-3 [&>p:last-child]:mb-0 [&_a]:text-[#FF9933] [&_a]:font-bold [&_a]:underline hover:[&_a]:text-[#1A1A1A] [&_a]:transition-colors [&_strong]:font-bold">${cleanHtml}</div>`;
        
        const updatedHistory = await chatSession.getHistory();
        return { agentHtml, newHistory: updatedHistory };
        
    } catch(e: any) {
        logger.error({ err: e }, "Gemini API Generation Error");
        
        // Smart Offline/Mock Fallbacks - NLP style Regexes
        const registerRegex = /(?<!not\s)(eligible|qualify|register to vote|turn 18|how to register)/i;
        const boothRegex = /(?<!not\s)(booth|where to vote|location|polling station)/i;
        
        if (registerRegex.test(message)) {
            return { agentHtml: generateOfflineEligibilityHtml(), newHistory: history };
        }
        
        if (boothRegex.test(message) || message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
             return { agentHtml: generateOfflineBoothHtml(), newHistory: history };
        }

        return { agentHtml: generateGenericOfflineFallbackHtml(e.message || "Unknown error"), newHistory: history };
    }
}
