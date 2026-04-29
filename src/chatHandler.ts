import { getGeminiModel } from "./aiService.js";
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import {
    generateSequoiaPitchHtml,
    generateRepInsightsHtml,
    generateGenericOfflineFallbackHtml,
    generateOfflineEligibilityHtml,
    generateOfflineBoothHtml,
} from "./uiTemplates.js";
import { SYSTEM_CONSTANTS } from "./constants.js";
import { fetchRepresentativesByAddress } from "./civicApiService.js";
import { ChatHistoryItem, UserContext } from "./types.js";

export const handleChat = async (message: string, history: ChatHistoryItem[] = [], locale: string = "en", apiKey?: string, userContext?: UserContext) => {

    // Sequoia Pitch Auto-Demo Handler
    if (message === SYSTEM_CONSTANTS.COMMANDS.START_PITCH) {
        return { agentHtml: generateSequoiaPitchHtml(), newHistory: history };
    }

    // KNOW_REP: Try Google Civic Information API first, then local DB fallback, then demo
    if (message === SYSTEM_CONSTANTS.COMMANDS.KNOW_REP) {
        // Build an address from user profile for Civic API lookup
        const address = [
            userContext?.user?.constituency,
            userContext?.user?.state,
            'India',
        ].filter(Boolean).join(', ');

        if (address && address !== 'India') {
            try {
                const civicResult = await fetchRepresentativesByAddress(address);

                if (civicResult.source === 'google_civic_api' && civicResult.representatives.length > 0) {
                    const reps = civicResult.representatives.slice(0, 3); // show top 3
                    const repCards = reps.map(rep => `
                        <div class="p-3 bg-white border-2 border-[#1A1A1A] shadow-[2px_2px_0px_#1A1A1A] mb-3">
                            <p class="font-bold text-sm">${DOMPurify.sanitize(rep.name)}</p>
                            ${rep.office ? `<p class="text-xs text-[#4285f4] font-bold uppercase tracking-widest">${DOMPurify.sanitize(rep.office)}</p>` : ''}
                            ${rep.party ? `<p class="text-xs opacity-70">${DOMPurify.sanitize(rep.party)}</p>` : ''}
                            ${rep.phones?.length ? `<p class="text-xs mt-1">📞 ${DOMPurify.sanitize(rep.phones[0])}</p>` : ''}
                            ${rep.urls?.length ? `<a href="${DOMPurify.sanitize(rep.urls[0])}" target="_blank" class="text-xs text-[#FF9933] underline font-bold">Official Website →</a>` : ''}
                        </div>
                    `).join('');

                    const html = `
                        <div class="space-y-3">
                            <p class="text-xs bg-[#4285f4] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Google Civic API · Live Data</p>
                            <p class="text-sm">Representatives for <strong>${DOMPurify.sanitize(civicResult.normalizedAddress || address)}</strong>:</p>
                            ${repCards}
                            <p class="text-[10px] opacity-50 mt-2">Data sourced from Google Civic Information API · Election Commission of India</p>
                        </div>
                    `;
                    return { agentHtml: html, newHistory: history };
                }
            } catch (_e) {
                // fall through to local DB / demo
            }
        }

        // Fall back to local DB representatives
        if (userContext?.representatives && userContext.representatives.length > 0 && userContext.constituency) {
            const rep = userContext.representatives[0];
            const html = `
                <div class="space-y-4">
                    <p>Based on your profile in <strong>${DOMPurify.sanitize(userContext.constituency.name)}</strong>, your current representative is <strong>${DOMPurify.sanitize(rep.name)}</strong> from <strong>${DOMPurify.sanitize(rep.party)}</strong>.</p>
                    <p class="text-[10px] opacity-50">Data sourced from Election Commission of India</p>
                </div>
            `;
            return { agentHtml: html, newHistory: history };
        } else {
            return { agentHtml: generateRepInsightsHtml(), newHistory: history };
        }
    }

    try {
        const ai = getGeminiModel(apiKey);

        let responseText = "";

        let userContextString = "";
        if (userContext) {
            userContextString = `\n\nUSER CONTEXT:\n${JSON.stringify(userContext, null, 2)}\nUse this context to answer questions about their specific representative or constituency when asked.`;
        }

        if (ai === "MOCK_MODE") {
            const lowerMsg = message.toLowerCase();
            if (lowerMsg.includes("eligible") || lowerMsg.includes("qualify") || lowerMsg.includes("18") || lowerMsg.includes("register")) {
                return { agentHtml: generateOfflineEligibilityHtml(), newHistory: history };
            } else if (lowerMsg.includes("booth") || lowerMsg.includes("location") || lowerMsg.includes("where")) {
                return { agentHtml: generateOfflineBoothHtml(), newHistory: history };
            } else {
                return {
                    agentHtml: `<div class="space-y-3"><p class="text-xs bg-[#FF9933] text-black px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Demo Mode</p><p>You are chatting in Demo Mode. I can answer basic questions about <strong>eligibility</strong> or finding your <strong>polling booth</strong>.</p><p class="text-sm border-t border-[#1A1A1A] pt-2 border-dashed">To unlock full AI capabilities, please ensure a valid <strong>GEMINI_API_KEY</strong> is configured on the server.</p></div>`,
                    newHistory: history
                };
            }
        }

        const languageInstruction = locale === 'hi' ? 'You MUST respond entirely in Hindi (हिंदी).' : 'You MUST respond entirely in English.';
        const instructions = SYSTEM_CONSTANTS.PROMPTS.SYSTEM_INSTRUCTION + languageInstruction + userContextString;

        // FIND_BOOTH_LOCATION: coordinates received — generate Google Maps embed + link
        if (message.startsWith(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION)) {
            const coords = message.replace(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION, "").split("|");
            if (coords.length === 2) {
                const lat = parseFloat(coords[0]);
                const lng = parseFloat(coords[1]);
                const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
                const searchQuery = encodeURIComponent('polling booth near me');

                // Build rich response with Google Maps embed if key available
                let mapsHtml = '';
                if (mapsKey) {
                    const embedUrl = `https://www.google.com/maps/embed/v1/search?key=${mapsKey}&q=${searchQuery}&center=${lat},${lng}&zoom=14`;
                    mapsHtml = `
                        <div class="mt-3 border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A] overflow-hidden">
                            <iframe
                                title="Polling Booth Map"
                                width="100%"
                                height="250"
                                style="border:0"
                                loading="lazy"
                                allowfullscreen
                                src="${embedUrl}">
                            </iframe>
                        </div>
                    `;
                }

                const directionsUrl = `https://www.google.com/maps/search/polling+booth/@${lat},${lng},14z`;
                const html = `
                    <div class="space-y-3">
                        <p class="text-xs bg-[#34a853] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">📍 Google Maps · Location Acquired</p>
                        <p>Your coordinates: <strong>${lat.toFixed(5)}, ${lng.toFixed(5)}</strong></p>
                        ${mapsHtml}
                        <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer"
                           class="inline-block mt-2 px-4 py-2 bg-[#4285f4] text-white border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest shadow-[2px_2px_0px_#1A1A1A] hover:shadow-none hover:translate-y-[2px] transition-all">
                            Open in Google Maps →
                        </a>
                        <p class="text-[10px] opacity-50">Powered by Google Maps · Data sourced from Election Commission of India</p>
                    </div>
                `;
                return { agentHtml: html, newHistory: history };
            }
        }

        const cleanHistory = history.map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: (h as any).parts?.[0]?.text || h.text || '' }]
        }));

        const contents = [...cleanHistory, { role: 'user', parts: [{ text: message }] }];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                system_instruction: instructions,
                max_output_tokens: 500,
                temperature: 0.7,
            },
            tools: [
                { google_search: {} }
            ]
        });

        responseText = response.text || "I encountered an issue generating a response.";

        // Sync parsing if possible, or await if marked is configured as async
        const rawHtml = await marked.parse(responseText);
        const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
        const agentHtml = `<div class="[&>p]:mb-3 [&>p:last-child]:mb-0 [&_a]:text-[#FF9933] [&_a]:font-bold [&_a]:underline hover:[&_a]:text-[#1A1A1A] [&_a]:transition-colors [&_strong]:font-bold">${cleanHtml}</div>`;

        const simplifiedHistory: ChatHistoryItem[] = [...history, { role: 'user', text: message }, { role: 'model', text: responseText }].map((h) => ({
            role: (h.role === 'model' ? 'model' : 'user') as 'user' | 'model',
            text: DOMPurify.sanitize((h as any).parts?.[0]?.text || h.text || '', { ALLOWED_TAGS: [] })
        })).slice(-20);

        return { agentHtml, newHistory: simplifiedHistory };

    } catch (e: unknown) {
        // Generic text for user, detailed for logs
        const errorMessage = e instanceof Error ? e.message : String(e);
        const safeError = "Intelligence Core Offline. Please check your connection.";
        const failedHistory: ChatHistoryItem[] = [...history, { role: 'user' as const, text: message }].slice(-20);
        return { agentHtml: generateGenericOfflineFallbackHtml(errorMessage || safeError), newHistory: failedHistory };
    }
}
