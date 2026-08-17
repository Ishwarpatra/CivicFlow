import DOMPurify from 'isomorphic-dompurify';
import { getElectionDataStatus } from './database.js';

const buildChatBubble = (iconContent: string, iconBg: string, bubbleBg: string, bubbleBorder: string, bubbleShadow: string, textStyle: string, message: string, customClasses: string = "", extraAttrs: string = "") => `
    <div x-data="{ show: false }" x-init="setTimeout(() => show = true, 50)" :class="show ? 'chat-bubble-entered' : 'chat-bubble-enter'" class="spring-m3 flex gap-4 ${customClasses}">
        <div role="img" aria-label="${iconContent === 'YOU' ? 'User' : 'AI'} Avatar" class="w-8 h-8 ${iconBg} text-white flex items-center justify-center text-xs font-bold shrink-0 border border-[#1A1A1A]">${iconContent}</div>
        <div ${extraAttrs} role="log" aria-live="polite" class="p-4 ${bubbleBg} ${textStyle} text-sm leading-relaxed max-w-[85%] sm:max-w-[80%] border ${bubbleBorder} ${bubbleShadow}">
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

export const generateRepInsightsHtml = (status: 'unavailable' | 'misconfigured' | 'rate_limited' = 'unavailable') => {
    const message = status === 'misconfigured'
        ? 'Live representative lookup is not configured on this installation.'
        : status === 'rate_limited'
            ? 'The live representative provider is temporarily rate-limited. Please try again later.'
            : 'We could not retrieve a live representative record.';
    return `
    <div class="space-y-3" role="status">
        <p class="text-xs bg-[#FF9933] text-black px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Representative lookup</p>
        <p>${message} Please update your India-scoped state and constituency in Settings, then retry.</p>
        <a href="https://electoralsearch.eci.gov.in/" target="_blank" rel="noopener noreferrer" class="text-[#FF9933] underline font-bold text-sm">Use official ECI electoral search →</a>
    </div>
`;
};

export const generateElectionResultsHtml = (electionData: Record<string, unknown> | null | undefined) => {
    const status = getElectionDataStatus((electionData || {}) as { valid_until?: string });
    if (status === 'stale') return `
        <div class="space-y-3">
            <p class="text-xs bg-[#ea4335] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Stale election data</p>
            <p>The local results dataset is no longer current, so CivicFlow will not present it as live election information.</p>
            <p class="text-xs opacity-70">Dataset: ${DOMPurify.sanitize(String(electionData?.election || 'Unknown election'))} · Retrieved: ${DOMPurify.sanitize(String(electionData?.retrieved_at || 'unknown'))}</p>
            <a href="https://results.eci.gov.in/" target="_blank" rel="noopener noreferrer" class="text-[#FF9933] font-bold underline">Open official Election Commission results →</a>
        </div>
    `;

    const states = Array.isArray(electionData?.states) ? electionData.states : [];
    const rows = states.flatMap((state) => {
        if (!state || typeof state !== 'object') return [];
        const stateRecord = state as { name?: unknown; constituencies?: unknown };
        const constituencies = Array.isArray(stateRecord.constituencies) ? stateRecord.constituencies : [];
        return constituencies.flatMap((constituency) => {
            if (!constituency || typeof constituency !== 'object') return [];
            const item = constituency as { name?: unknown; winner?: unknown; runnerUp?: unknown; turnout_pct?: unknown };
            const winner = item.winner && typeof item.winner === 'object' ? item.winner as { name?: unknown; party?: unknown; votes?: unknown } : {};
            const runnerUp = item.runnerUp && typeof item.runnerUp === 'object' ? item.runnerUp as { name?: unknown; party?: unknown; votes?: unknown } : {};
            return [{
                state: String(stateRecord.name || ''),
                constituency: String(item.name || ''),
                winner: String(winner.name || 'Not available'),
                winnerParty: String(winner.party || ''),
                winnerVotes: Number(winner.votes || 0).toLocaleString('en-IN'),
                runnerUp: String(runnerUp.name || 'Not available'),
                runnerUpParty: String(runnerUp.party || ''),
                turnout: String(item.turnout_pct ?? 'N/A'),
            }];
        });
    });

    if (!rows.length) return `
        <div class="space-y-3">
            <p class="text-xs bg-[#FF9933] text-black px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">Election results</p>
            <p>Results are not available for the requested election in this installation.</p>
        </div>
    `;

    const safe = (value: string) => DOMPurify.sanitize(value, { ALLOWED_TAGS: [] });
    return `
        <div class="space-y-4">
            <p class="text-xs bg-[#4285f4] text-white px-2 py-1 inline-block uppercase font-bold tracking-widest shadow-[2px_2px_0px_#1A1A1A]">${safe(String(electionData?.election || 'Election results'))}</p>
            <p class="text-sm">Showing the locally available ${status === 'undated' ? 'undated' : 'dated'} results dataset. It covers ${rows.length} constituencies.</p>
            <div class="space-y-3">
                ${rows.map((row) => `
                    <div class="p-3 bg-white border-2 border-[#1A1A1A] shadow-[2px_2px_0px_#1A1A1A]">
                        <p class="font-bold">${safe(row.constituency)} <span class="font-normal opacity-60">· ${safe(row.state)}</span></p>
                        <p class="text-xs mt-2"><strong>Winner:</strong> ${safe(row.winner)}${row.winnerParty ? ` (${safe(row.winnerParty)})` : ''} · ${safe(row.winnerVotes)} votes</p>
                        <p class="text-xs"><strong>Runner-up:</strong> ${safe(row.runnerUp)}${row.runnerUpParty ? ` (${safe(row.runnerUpParty)})` : ''}</p>
                        <p class="text-xs opacity-70 mt-1">Turnout: ${safe(row.turnout)}%</p>
                    </div>
                `).join('')}
            </div>
            <p class="text-[10px] opacity-50">Source: ${safe(String(electionData?.source || 'Local election dataset'))}</p>
        </div>
    `;
};

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

export const generateVoteSuccessHtml = () => `<div class="p-3 border-2 border-[#34a853] bg-[#F8F7F3]" role="status"><p class="font-bold text-[#34a853]">Vote recorded locally</p><p class="text-xs mt-1">View your vote status from your account.</p><a href="#vote-status" class="text-xs text-[#FF9933] underline font-bold">View vote status →</a></div>`;
export const generateVotePendingHtml = () => `<div class="p-3 border-2 border-[#FF9933] bg-[#F8F7F3]" role="status"><p class="font-bold text-[#FF9933]">Vote saved; cloud sync pending</p><p class="text-xs mt-1">Your local record is safe and will be retried by the service.</p><a href="#vote-status" class="text-xs text-[#FF9933] underline font-bold">Check sync status →</a></div>`;
export const generateAlreadyVotedHtml = () => `<div class="p-3 border-2 border-[#4285f4] bg-[#F8F7F3]" role="status"><p class="font-bold text-[#4285f4]">Already recorded</p><p class="text-xs mt-1">You already have a vote for this election.</p><a href="#vote-status" class="text-xs text-[#FF9933] underline font-bold">View vote status →</a></div>`;
export const generateVoteErrorHtml = () => `<div class="p-3 border-2 border-[#ea4335] bg-[#F8F7F3]" role="alert"><p class="font-bold text-[#ea4335]">Vote could not be recorded</p><button hx-post="/api/vote" hx-swap="outerHTML" class="text-xs text-[#FF9933] underline font-bold mt-1">Retry →</button></div>`;
export const generateLoginToVoteHtml = () => `<div class="p-3 border-2 border-[#1A1A1A] bg-[#F8F7F3]" role="status"><p class="font-bold">Sign in to record a vote</p><p class="text-xs mt-1">Create an account or sign in before continuing.</p><button @click="document.querySelector('[data-auth-open]')?.click()" class="text-xs text-[#FF9933] underline font-bold mt-1">Sign in / Create account →</button></div>`;
export const generateCreditUpdateScript = (amount: number) => `<script>document.dispatchEvent(new CustomEvent('update-credits', { detail: ${amount} }));</script>`;

export interface LogEntry {
    time: number;
    level: number;
    msg?: string;
    err?: { message?: string } | any;
}

export function generateAdminLogsHtml(logs: LogEntry[], isPartial: boolean): string {
    const rows = logs.map(log => {
        const safeMsg = DOMPurify.sanitize(log.msg || '');
        const safeErr = DOMPurify.sanitize(log.err ? log.err.message || JSON.stringify(log.err) : '');
        const dateStr = isNaN(log.time) ? 'Invalid Date' : new Date(log.time).toLocaleString();
        return `
        <tr class="border-b border-black hover:bg-gray-100">
            <td class="p-2 text-xs font-mono">${dateStr}</td>
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
                <button class="w-8 h-8 border-2 border-white hover:bg-white hover:text-black" @click="showAdminLogs = false">Close</button>
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
