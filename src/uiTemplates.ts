import DOMPurify from "isomorphic-dompurify";

const buildChatBubble = (iconContent: string, iconBg: string, bubbleBg: string, bubbleBorder: string, bubbleShadow: string, textStyle: string, message: string, customClasses: string = "", extraAttrs: string = "") => `
    <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 ${customClasses}">
        <div class="w-8 h-8 ${iconBg} text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#1A1A1A]">${iconContent}</div>
        <div ${extraAttrs} class="p-4 ${bubbleBg} ${textStyle} text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border ${bubbleBorder} ${bubbleShadow}">
            ${message}
        </div>
    </div>
`;

export const generateUserMessageHtml = (message: string) => 
    buildChatBubble('YOU', 'bg-[#FF9933]', 'bg-black', 'border-[#1A1A1A]', 'shadow-[4px_4px_0px_#1A1A1A]', 'text-white', message, 'flex-row-reverse mb-6');

export const generateAgentMessageHtml = (agentResponse: string) => 
    buildChatBubble('AI', 'bg-[#1A1A1A]', 'bg-[#F0F0F0]', 'border-[#1A1A1A]', 'shadow-[4px_4px_0px_#1A1A1A]', 'text-[#1A1A1A]', agentResponse, 'mb-6 relative', 'aria-live="polite"');

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
            <div class="absolute top-0 right-0 py-1 px-8 bg-[#ea4335] text-white text-[10px] font-bold tracking-widest transform rotate-45 translate-x-6 translate-y-2 border-y-2 border-[#1A1A1A]">STATIC DEMO</div>
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
            
            <div class="mt-4 flex justify-between items-center bg-[#F0F0F0] p-2 border-2 border-[#1A1A1A] shadow-[2px_2px_0px_#1A1A1A]">
                <p class="text-xs font-bold uppercase pl-2 flex-1">Mark as Voted?</p>
                <form hx-post="/api/vote" hx-swap="outerHTML">
                    <button type="submit" class="bg-white text-[#1A1A1A] hover:bg-[#FF9933] hover:text-white px-3 py-2 border-2 border-[#1A1A1A] font-bold text-xs uppercase tracking-widest relative transition-colors flex items-center gap-2 group cursor-pointer shadow-[2px_2px_0px_#1A1A1A] active:translate-y-[2px] active:shadow-none">
                        <span>VOTE NOW</span>
                    </button>
                </form>
            </div>
        </div>
    </div>
`;

export const generateOfflineEligibilityHtml = () => `
    <div class="space-y-3">
        <p class="text-xs bg-black text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
        <p>Based on your input, you will likely qualify for the <strong>upcoming quarterly registration cycle</strong>.</p>
        <p>In India, citizens who turn 18 by <strong>Jan 1, Apr 1, Jul 1, or Oct 1</strong> can register in advance instead of waiting over a year! I can help you draft Form 6.</p>
    </div>
`;

export const generateOfflineBoothHtml = () => `
    <div class="space-y-3">
        <p class="text-xs bg-black text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#FF9933]">Offline Intelligence</p>
        <p>To find your polling booth without live AI access, you can visit the <a href="https://electoralsearch.eci.gov.in/" target="_blank" class="text-[#FF9933] font-bold underline hover:text-[#1A1A1A] transition-colors">Official ECI Electoral Search</a>.</p>
        <p>You can search by your EPIC number or personal details.</p>
    </div>
`;

export const generateGenericOfflineFallbackHtml = (errorDetails: string) => {
    const safeError = DOMPurify.sanitize(errorDetails, { ALLOWED_TAGS: [] });
    return `
    <div class="space-y-4">
        <p class="text-xs bg-[#ea4335] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Intelligence Core Offline</p>
        <p>I cannot process natural language right now. Please use the official ECI portals below:</p>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <a href="https://voters.eci.gov.in/" target="_blank" class="block p-3 border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors shadow-[2px_2px_0px_#1A1A1A] group">
                <p class="font-bold uppercase tracking-widest text-xs mb-1">Check Eligibility & Forms</p>
                <p class="text-[10px] opacity-80 group-hover:opacity-100">Voter Portal (voters.eci.gov.in)</p>
            </a>
            <a href="https://electoralsearch.eci.gov.in/" target="_blank" class="block p-3 border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors shadow-[2px_2px_0px_#1A1A1A] group">
                <p class="font-bold uppercase tracking-widest text-xs mb-1">Find Polling Booth</p>
                <p class="text-[10px] opacity-80 group-hover:opacity-100">Electoral Search</p>
            </a>
            <a href="https://affidavit.eci.gov.in/" target="_blank" class="block p-3 border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white transition-colors shadow-[2px_2px_0px_#1A1A1A] group sm:col-span-2">
                <p class="font-bold uppercase tracking-widest text-xs mb-1">Know Your Representative</p>
                <p class="text-[10px] opacity-80 group-hover:opacity-100">Candidate Affidavits</p>
            </a>
        </div>
        
        <p class="text-[10px] opacity-50 font-mono mt-4 break-words">Log Reference: ${safeError}</p>
    </div>
`;
};

export const generateErrorHtml = (errorDetails: string) => {
    const safeError = DOMPurify.sanitize(errorDetails, { ALLOWED_TAGS: [] });
    return buildChatBubble('ERR', 'bg-[#ea4335]', 'bg-[#F8F7F3]', 'border-[#ea4335]', 'shadow-[4px_4px_0px_#ea4335]', 'text-[#ea4335] flex flex-col gap-2', `<p class="font-bold uppercase tracking-widest text-xs mb-2 text-[#1A1A1A]">System Error</p><p>${safeError}</p>`, 'mb-6 relative');
};

export function generateAdminLogsHtml(logs: any[], isPartial: boolean): string {
    const rows = logs.map(log => {
        const safeMsg = DOMPurify.sanitize(log.msg || '');
        const safeErr = DOMPurify.sanitize(log.err ? log.err.message || JSON.stringify(log.err) : '');
        return `
        <tr class="border-b border-black hover:bg-gray-100">
            <td class="p-2 text-xs font-mono">${new Date(log.time).toLocaleString()}</td>
            <td class="p-2 text-xs font-bold ${log.level >= 50 ? 'text-red-600' : 'text-green-600'}">${log.level >= 50 ? 'ERR' : 'INFO'}</td>
            <td class="p-2 text-xs break-all">${safeMsg}</td>
            <td class="p-2 text-[10px] font-mono opacity-60">${safeErr}</td>
        </tr>`;
    }).join('');

    if (isPartial) return rows;

    return `
        <div class="h-full flex flex-col bg-white border-2 border-black shadow-[4px_4px_0px_black]">
            <div class="bg-black text-white p-3 flex justify-between items-center">
                <h2 class="font-bold uppercase tracking-widest text-sm">System Logs</h2>
                <button class="w-8 h-8 border-2 border-white hover:bg-white hover:text-black" @click="showAdminLogs = false">✕</button>
            </div>
            <div class="overflow-y-auto p-4 flex-1">
                <table class="w-full text-left">
                    <thead><tr class="bg-gray-200"><th>Time</th><th>Lvl</th><th>Message</th><th>Trace</th></tr></thead>
                    <tbody hx-get="/api/admin/logs?partial=true" hx-trigger="every 5s [showAdminLogs]" hx-swap="outerHTML" hx-select="tbody">
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
