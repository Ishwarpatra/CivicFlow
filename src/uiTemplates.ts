export const generateUserMessageHtml = (message: string) => `
    <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 flex-row-reverse mb-6">
        <div class="w-8 h-8 bg-[#FF9933] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#1A1A1A]">YOU</div>
        <div class="p-4 bg-black text-white text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A]">
            ${message}
        </div>
    </div>
`;

export const generateAgentMessageHtml = (agentResponse: string) => `
    <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 mb-6 relative">
        <div class="w-8 h-8 bg-[#1A1A1A] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#1A1A1A]">AI</div>
        <div aria-live="polite" class="p-4 bg-[#F0F0F0] text-[#1A1A1A] text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A]">
            ${agentResponse}
        </div>
    </div>
`;

export const generateSequoiaPitchHtml = () => `
    <div class="space-y-4">
        <p class="text-sm font-bold uppercase tracking-widest text-[#FF9933] border-b-2 border-[#1A1A1A] pb-2">Pitch Deck Initiated</p>
        <p><strong>The Problem:</strong> The ECI FAQ is over 100 pages long. 18-year-old first-time voters are overwhelmed.</p>
        <p><strong>The Solution:</strong> An agentic "Civic Navigator" that proactively fetches station locations and schedules deadlines.</p>
        <p><strong>Why Now?</strong> The 2025-2026 election cycle introduces quarterly qualifying dates. Static websites cannot handle dynamic eligibility logic.</p>
        <p class="mt-4 p-2 bg-[#FF9933] text-black font-bold uppercase text-xs inline-block shadow-[4px_4px_0px_#1A1A1A] border-2 border-[#1A1A1A]">Impact: 100M+ New Voters</p>
    </div>
`;

export const generateRepInsightsHtml = () => `
    <div class="space-y-6">
        <div class="p-4 bg-white border-2 border-[#1A1A1A] shadow-[4px_4px_0px_#1A1A1A] relative overflow-hidden group">
            <div class="absolute top-0 right-0 w-16 h-16 bg-[#FF9933] transform rotate-45 translate-x-8 -translate-y-8 border-l-2 border-b-2 border-[#1A1A1A]"></div>
            <h3 class="text-xl font-bold uppercase tracking-widest text-[#1A1A1A] mb-1">Hon. Prashant Kishore</h3>
            <p class="text-xs uppercase opacity-90 mb-4 bg-[#FF9933] text-white inline-block px-2 py-0.5 font-bold border border-[#1A1A1A]">South Chennai District</p>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="bg-[#F8F7F3] p-3 border border-[#1A1A1A]">
                    <p class="text-xs uppercase font-bold text-[#4285f4]">Attendance</p>
                    <p class="text-2xl font-black">88%</p>
                </div>
                <div class="bg-[#F8F7F3] p-3 border border-[#1A1A1A]">
                    <p class="text-xs uppercase font-bold text-[#ea4335]">Criminal Records</p>
                    <p class="text-2xl font-black">0</p>
                </div>
            </div>

            <div class="mb-6 space-y-2">
                <div class="flex justify-between items-end">
                    <p class="text-xs font-bold uppercase text-[#1A1A1A]">CivicTrust Score</p>
                    <p class="text-sm font-black text-[#34a853]">A+</p>
                </div>
                <div class="w-full h-3 border-2 border-[#1A1A1A] p-0.5 bg-white overflow-hidden relative">
                    <div class="h-full w-[92%] bg-[#34a853] absolute left-0 top-0 bottom-0 origin-left scale-x-0 animate-[scale-line_1s_ease-out_forwards]"></div>
                </div>
                <p class="text-xs opacity-70">Sourced from PRS India & MyNeta</p>
            </div>
            
            <div x-data="{ voted: false }" class="mt-4 flex justify-between items-center bg-[#F0F0F0] p-2 border-2 border-[#1A1A1A] shadow-[2px_2px_0px_#1A1A1A]">
                <p class="text-xs font-bold uppercase pl-2 flex-1">Mark as Voted?</p>
                <button @click="voted = true" :class="voted ? 'bg-[#1A1A1A] text-white ink-applied' : 'bg-white text-[#1A1A1A] hover:bg-[#FF9933] hover:text-white'" class="px-3 py-2 border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative transition-colors flex items-center gap-2 group cursor-pointer shadow-[2px_2px_0px_#1A1A1A] active:translate-y-[2px] active:shadow-none">
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

export const generateOfflineEligibilityHtml = () => `
    <div class="space-y-3">
        <p class="text-xs bg-[#1A1A1A] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
        <p>Based on your input, you will likely qualify for the <strong>upcoming quarterly registration cycle</strong>.</p>
        <p>In India, citizens who turn 18 by <strong>Jan 1, Apr 1, Jul 1, or Oct 1</strong> can register in advance instead of waiting over a year! I can help you draft Form 6.</p>
    </div>
`;

export const generateOfflineBoothHtml = () => `
    <div class="space-y-3">
        <p class="text-xs bg-[#1A1A1A] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
        <p>To find your polling booth without live AI access, you can visit the <a href="https://electoralsearch.eci.gov.in/" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Official ECI Electoral Search</a>.</p>
        <p>You can search by your EPIC number or personal details.</p>
    </div>
`;

export const generateGenericOfflineFallbackHtml = (errorDetails: string) => `
    <div class="space-y-3">
        <p class="text-xs bg-[#ea4335] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">System Diagnostics</p>
        <p>Intelligence Core Offline. Please check your API configuration.</p>
        <p class="text-xs opacity-70 p-2 border border-[#ea4335] bg-[#F8F7F3] break-words text-[#ea4335]">Log: ${errorDetails}</p>
    </div>
`;

export const generateErrorHtml = (errorDetails: string) => `
    <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 mb-6 relative">
        <div class="w-8 h-8 bg-[#ea4335] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#1A1A1A]">ERR</div>
        <div class="p-4 bg-[#F8F7F3] text-[#ea4335] text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border border-[#ea4335] shadow-[4px_4px_0px_#ea4335] flex flex-col gap-2">
            <p class="font-bold uppercase tracking-widest text-xs mb-2 text-[#1A1A1A]">System Error</p>
            <p>${errorDetails}</p>
        </div>
    </div>
`;
