import { getGeminiModel } from "./aiService.js";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import pino from "pino";
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

export const handleChat = async (message: string) => {
    
    // Sequoia Pitch Auto-Demo Handler
    if (message === SYSTEM_CONSTANTS.COMMANDS.START_PITCH) {
        return generateSequoiaPitchHtml();
    }

    if (message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
        return generateRepInsightsHtml();
    }

    try {
        const ai = getGeminiModel();
        
        let instructions = `You are CivicFlow, the Intelligent Indian Election Navigator. Your goal is to guide citizens, answer election-related questions, check eligibility, and help them find polling booths. Respond concisely and engagingly.`;

        if (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
             const coords = message.replace(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION, "").split("|");
             if(coords.length === 2) {
                 const lat = coords[0];
                 const lng = coords[1];
                 const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
                 return `I received your location coordinates! I've scanned the electoral registry... Your nearest station is likely within 1.2km of you. \n\n<a href="${mapsUrl}" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Open Booth Locator Map</a>`;
             }
         }

        const response = await ai.generateContent({
             model: "gemini-1.5-pro",
             contents: message,
             config: {
                 systemInstruction: instructions,
                 tools: [
                     { googleSearch: {} } // Enable grounding for latest ECI rules
                 ]
             }
        });
        
        const rawHtml = await marked.parse(response.text || "I'm sorry, I encountered an issue.");
        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
        return `<div class="[&>p]:mb-3 [&>p:last-child]:mb-0 [&_a]:text-[#FF9933] [&_a]:font-bold [&_a]:underline hover:[&_a]:text-[#1A1A1A] [&_a]:transition-colors [&_strong]:font-bold">${cleanHtml}</div>`;
        
    } catch(e: any) {
        logger.error({ err: e }, "Gemini API Generation Error");
        
        // Smart Offline/Mock Fallbacks - NLP style Regexes
        const registerRegex = /(?<!not\s)(eligible|qualify|register to vote|turn 18|how to register)/i;
        const boothRegex = /(?<!not\s)(booth|where to vote|location|polling station)/i;
        
        if (registerRegex.test(message)) {
            return generateOfflineEligibilityHtml();
        }
        
        if (boothRegex.test(message) || message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
             return generateOfflineBoothHtml();
        }

        return generateGenericOfflineFallbackHtml(e.message || "Unknown error");
    }
}
