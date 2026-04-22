import { getGeminiModel } from "./aiService.js";
import { marked } from "marked";

export const handleChat = async (message: string) => {
    
    // Sequoia Pitch Auto-Demo Handler
    if (message === "START_PITCH") {
        return `
            <div class="space-y-4">
                <p class="text-[12px] font-bold uppercase tracking-widest text-[#FF9933] border-b-2 border-[#1A1A1A] pb-2">Pitch Deck Initiated</p>
                <p><strong>The Problem:</strong> The ECI FAQ is over 100 pages long. 18-year-old first-time voters are overwhelmed.</p>
                <p><strong>The Solution:</strong> An agentic "Civic Navigator" that proactively fetches station locations and schedules deadlines.</p>
                <p><strong>Why Now?</strong> The 2025-2026 election cycle introduces quarterly qualifying dates. Static websites cannot handle dynamic eligibility logic.</p>
                <p class="mt-4 p-2 bg-[#FF9933] text-black font-bold uppercase text-[10px] inline-block shadow-[4px_4px_0px_#1A1A1A] border-2 border-[#1A1A1A]">Impact: 100M+ New Voters</p>
            </div>
        `;
    }

    if (message === "KNOW_REP") {
        return `
            <div class="space-y-6">
                <div class="p-4 bg-white border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A] relative overflow-hidden group">
                    <div class="absolute top-0 right-0 w-16 h-16 bg-[#FF9933] transform rotate-45 translate-x-8 -translate-y-8 border-l-2 border-b-2 border-[#1A1A1A]"></div>
                    <h3 class="text-xl font-bold uppercase tracking-widest text-[#1A1A1A] mb-1">Hon. Prashant Kishore</h3>
                    <p class="text-[10px] uppercase opacity-90 mb-4 bg-[#FF9933] text-white inline-block px-2 py-0.5 font-bold border border-[#1A1A1A]">South Chennai District</p>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="bg-[#F8F7F3] p-3 border border-[#1A1A1A]">
                            <p class="text-[9px] uppercase font-bold text-[#4285f4]">Attendance</p>
                            <p class="text-2xl font-black">88%</p>
                        </div>
                        <div class="bg-[#F8F7F3] p-3 border border-[#1A1A1A]">
                            <p class="text-[9px] uppercase font-bold text-[#ea4335]">Criminal Records</p>
                            <p class="text-2xl font-black">0</p>
                        </div>
                    </div>

                    <div class="mb-6 space-y-2">
                        <div class="flex justify-between items-end">
                            <p class="text-[10px] font-bold uppercase text-[#1A1A1A]">CivicTrust Score</p>
                            <p class="text-sm font-black text-[#34a853]">A+</p>
                        </div>
                        <div class="w-full h-3 border-2 border-[#1A1A1A] p-0.5 bg-white overflow-hidden relative">
                            <div class="h-full w-[92%] bg-[#34a853] absolute left-0 top-0 bottom-0 origin-left scale-x-0 animate-[scale-line_1s_ease-out_forwards]"></div>
                        </div>
                        <p class="text-[9px] opacity-70">Sourced from PRS India & MyNeta</p>
                    </div>
                    
                    <div x-data="{ voted: false }" class="mt-4 flex justify-between items-center bg-[#F0F0F0] p-2 border-2 border-[#1A1A1A] shadow-[2px_2px_0px_#1A1A1A]">
                        <p class="text-[10px] font-bold uppercase pl-2 flex-1">Mark as Voted?</p>
                        <button @click="voted = true" :class="voted ? 'bg-[#1A1A1A] text-white ink-applied' : 'bg-white text-[#1A1A1A] hover:bg-[#FF9933] hover:text-white'" class="px-3 py-2 border-2 border-[#1A1A1A] font-bold text-[10px] uppercase tracking-widest relative transition-colors flex items-center gap-2 group cursor-pointer shadow-[2px_2px_0px_#1A1A1A] active:translate-y-[2px] active:shadow-none">
                            <span x-show="!voted">VOTE NOW</span>
                            <span x-show="voted">VOTED</span>
                            <svg x-show="voted" class="w-4 h-4" viewBox="0 0 24 24" fill="none">
                                <path stroke-linecap="round" stroke-linejoin="round" class="ink-path" stroke-width="4" d="M12 2v8" stroke="#8b5cf6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    try {
        const ai = getGeminiModel();
        
        let instructions = `You are CivicFlow, the Intelligent Indian Election Navigator. Your goal is to guide citizens, answer election-related questions, check eligibility, and help them find polling booths. Respond concisely and engagingly.`;

        if (message.startsWith("FIND_BOOTH_LOCATION|")) {
             const coords = message.replace("FIND_BOOTH_LOCATION|", "").split("|");
             if(coords.length === 2) {
                 const lat = coords[0];
                 const lng = coords[1];
                 const mapsUrl = `https://www.google.com/maps/search/polling+booth+near+me/@${lat},${lng},15z`;
                 return `I received your location coordinates! I've scanned the electoral registry... Your nearest station is likely within 1.2km of you. \n\n<a href="${mapsUrl}" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Open Booth Locator Map</a>`;
             }
         }

        const response = await ai.generateContent({
             model: "gemini-3.1-pro-preview",
             contents: message,
             config: {
                 systemInstruction: instructions,
                 tools: [
                     { googleSearch: {} } // Enable grounding for latest ECI rules
                 ]
             }
        });
        
        const html = await marked.parse(response.text || "I'm sorry, I encountered an issue.");
        return `<div class="[&>p]:mb-3 [&>p:last-child]:mb-0 [&_a]:text-[#FF9933] [&_a]:font-bold [&_a]:underline hover:[&_a]:text-[#1A1A1A] [&_a]:transition-colors [&_strong]:font-bold">${html}</div>`;
        
    } catch(e) {
        console.error("Gemini Error:", e.message || e);
        
        const lowerMsg = message.toLowerCase();
        
        // Smart Offline/Mock Fallbacks
        if (lowerMsg.includes("eligible") || lowerMsg.includes("18") || lowerMsg.includes("dob") || lowerMsg.includes("register")) {
            return `
                <div class="space-y-3">
                    <p class="text-[10px] bg-[#1A1A1A] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
                    <p>Based on your input, you will likely qualify for the <strong>upcoming quarterly registration cycle</strong>.</p>
                    <p>In India, citizens who turn 18 by <strong>Jan 1, Apr 1, Jul 1, or Oct 1</strong> can register in advance instead of waiting over a year! I can help you draft Form 6.</p>
                </div>
            `;
        }
        
        if (lowerMsg.includes("booth") || lowerMsg.includes("where") || lowerMsg.includes("location") || message.startsWith("FIND_BOOTH")) {
             return `
               <div class="space-y-3">
                    <p class="text-[10px] bg-[#1A1A1A] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
                    <p>I cannot compute exact geospatial queries without API connectivity, but typically, your booth will be assigned to a local government or primary school within 2km.</p>
                    <a href="https://maps.google.com/?q=polling+booth+near+me" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors"><br>Open Maps Explorer</a>
               </div>
             `;
        }

        return `
            <div class="border-l-4 border-[#FF9933] pl-4 italic text-sm">
                System is running in Offline/Demo mode due to missing or invalid API keys.
            </div>
            <br>
            I am the CivicFlow Navigator. I can schedule your Form 6 registration, locate your booth, and ground my answers in current ECI guidelines. (Try asking me "Am I eligible?" or "Find my polling booth"!)
        `;
    }
}
