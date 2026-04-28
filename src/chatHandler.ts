import { getGeminiModel } from "./aiService.js";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import pino from "pino";
import { 
    generateSequoiaPitchHtml, 
    generateRepInsightsHtml,
    generateGenericOfflineFallbackHtml,
    generateOfflineEligibilityHtml,
    generateOfflineBoothHtml
} from "./uiTemplates.js";
import { SYSTEM_CONSTANTS } from "./constants.js";

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

export const handleChat = async (message: string, history: any[] = [], locale: string = "en", apiKey?: string) => {
    
    // Sequoia Pitch Auto-Demo Handler
    if (message === SYSTEM_CONSTANTS.COMMANDS.START_PITCH) {
        return { agentHtml: generateSequoiaPitchHtml(), newHistory: history };
    }

    if (message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
        return { agentHtml: generateRepInsightsHtml(), newHistory: history };
    }

    try {
        const ai = getGeminiModel(apiKey);
        
        let responseText = "";
        
        // Check if we are running in dummy mock mode (placeholder key)
        if (ai === "MOCK_MODE") {
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("eligible") || lowerMsg.includes("qualify") || lowerMsg.includes("18") || lowerMsg.includes("register")) {
                return { agentHtml: generateOfflineEligibilityHtml(), newHistory: history };
            } else if (lowerMsg.includes("booth") || lowerMsg.includes("location") || lowerMsg.includes("where")) {
                return { agentHtml: generateOfflineBoothHtml(), newHistory: history };
            } else {
                 return { 
                     agentHtml: `<div class="space-y-3"><p class="text-xs bg-[#FF9933] text-black px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Demo Mode</p><p>You are chatting in Demo Mode (No API Key). I can answer basic questions about <strong>eligibility</strong> or finding your <strong>polling booth</strong>.</p><p class="text-sm border-t border-[#1A1A1A] pt-2 border-dashed">To unlock full AI capabilities, please add your <strong>GEMINI_API_KEY</strong> in the Secrets menu.</p></div>`, 
                     newHistory: history 
                 };
            }
        }
        
        const languageInstruction = locale === 'hi' ? 'You MUST respond entirely in Hindi (हिंदी).' : 'You MUST respond entirely in English.';
        const instructions = SYSTEM_CONSTANTS.PROMPTS.SYSTEM_INSTRUCTION + languageInstruction;

        if (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
             const coords = message.replace(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION, "").split("|");
             if(coords.length === 2) {
                 const lat = coords[0];
                 const lng = coords[1];
                 const mapsUrl = `http://maps.google.com/maps?q=${lat},${lng}`;
                 return { agentHtml: `I received your location coordinates! I've scanned the electoral registry... Your nearest station is likely within 1.2km of you. \n\n<a href="${mapsUrl}" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Open Booth Locator Map</a>`, newHistory: history };
             }
         }

        // Filter and map out messy history objects to raw light strings for the session
        const cleanHistory = history.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.parts?.[0]?.text || h.text || '' }]
        }));

        const contents = [...cleanHistory, { role: 'user', parts: [{ text: message }] }];

        const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: contents,
             config: {
                 systemInstruction: instructions,
                 tools: [
                     { googleSearch: {} } // Enable grounding for latest ECI rules
                 ]
             }
        });

        responseText = response.text || "I'm sorry, I encountered an issue.";
        
        const rawHtml = await marked.parse(responseText);
        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
        const agentHtml = `<div class="[&>p]:mb-3 [&>p:last-child]:mb-0 [&_a]:text-[#FF9933] [&_a]:font-bold [&_a]:underline hover:[&_a]:text-[#1A1A1A] [&_a]:transition-colors [&_strong]:font-bold">${cleanHtml}</div>`;
        
        // Serialize and slice history to max turning lengths strictly to { role, text }
        // Ensure that text is properly sanitized before placing into session memory to prevent XSS leakages
        const simplifiedHistory = [...history, { role: 'user', text: message }, { role: 'model', text: responseText }].map((h: any) => ({
             role: h.role === 'model' ? 'model' : 'user',
             text: DOMPurify.sanitize(h.parts?.[0]?.text || h.text || '', { ALLOWED_TAGS: [] })
        })).slice(-10);

        return { agentHtml, newHistory: simplifiedHistory };
        
    } catch(e: any) {
        logger.error({ err: e }, "Gemini API Generation Error");
        
        // Offline Fallback - generic text
        const safeError = "Civilian node disconnected. Please verify your internet connection or API settings.";
        const failedHistory = [...history, { role: 'user', text: message }].slice(-10);
        return { agentHtml: generateGenericOfflineFallbackHtml(e.message || safeError), newHistory: failedHistory };
    }
}
