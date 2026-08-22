import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChat } from '../src/chatHandler.js';
import { SYSTEM_CONSTANTS } from '../src/constants.js';

// Mock dependencies
vi.mock('../src/aiService.js', () => ({
    getGeminiModel: vi.fn().mockReturnValue({
        models: {
            generateContent: vi.fn().mockResolvedValue({
                text: 'AI response text'
            })
        }
    }),
    resetGeminiModel: vi.fn()
}));

vi.mock('../src/civicApiService.js', () => ({
    fetchRepresentativesByAddress: vi.fn().mockResolvedValue({
        source: 'google_civic_api',
        representatives: [
            { name: 'John Doe', office: 'Mayor', party: 'Independent' }
        ],
        normalizedAddress: '123 Test St, India'
    }),
    fetchPollingLocationsByAddress: vi.fn().mockResolvedValue({
        source: 'google_civic_api',
        representatives: [],
        pollingLocations: [{ name: 'Test Polling School', address: 'Chennai, Tamil Nadu' }]
    })
}));

describe('handleChat', () => {
    it('returns Sequoia Pitch for START_PITCH command', async () => {
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.START_PITCH);
        expect(result.agentHtml).toContain('Pitch Deck Initiated');
    });

    it('returns representatives for KNOW_REP command using Civic API', async () => {
        const userContext = {
            user: { state: 'Tamil Nadu', constituency: 'Chennai' }
        };
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.KNOW_REP, [], 'en', 'fake-key', userContext as any);
        expect(result.agentHtml).toContain('John Doe');
        expect(result.agentHtml).toContain('Google Civic API');
    });

    it('falls back to local representatives for KNOW_REP command', async () => {
        const { fetchRepresentativesByAddress } = await import('../src/civicApiService.js');
        (fetchRepresentativesByAddress as any).mockRejectedValueOnce(new Error('API Down'));

        const userContext = {
            user: { state: 'Tamil Nadu', constituency: 'Chennai' },
            constituency: { name: 'Chennai South' },
            representatives: [{ name: 'Local Rep', party: 'Local Party' }]
        };
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.KNOW_REP, [], 'en', 'fake-key', userContext as any);
        expect(result.agentHtml).toContain('Local Rep');
    });

    it('handles FIND_BOOTH_LOCATION with coordinates', async () => {
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION + '12.9716|77.5946');
        expect(result.agentHtml).toContain('12.97160');
        expect(result.agentHtml).toContain('77.59460');
        expect(result.agentHtml).toContain('Location Acquired');
    });

    it('uses profile address to render a named polling location', async () => {
        const { fetchPollingLocationsByAddress } = await import('../src/civicApiService.js');
        const userContext = { user: { state: 'Tamil Nadu', constituency: 'Chennai' } };
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION + '12.9716|77.5946', [], 'en', 'fake-key', userContext as any);
        expect(fetchPollingLocationsByAddress).toHaveBeenCalledWith('Chennai, Tamil Nadu, India');
        expect(result.agentHtml).toContain('Test Polling School');
    });

    it('rejects malformed GPS coordinates', async () => {
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.FIND_BOOTH_LOCATION + 'not-a-lat|999');
        expect(result.agentHtml).toContain('Location data is invalid');
    });

    it('shows a stale-data warning for expired election results', async () => {
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.ELECTION_RESULTS, [], 'en', undefined, {
            electionData: { election: 'Old election', retrieved_at: '2024-06-05', valid_until: '2024-12-31', states: [] }
        } as any);
        expect(result.agentHtml).toContain('Stale election data');
        expect(result.agentHtml).toContain('results.eci.gov.in');
    });

    it('renders only provided election results', async () => {
        const result = await handleChat(SYSTEM_CONSTANTS.COMMANDS.ELECTION_RESULTS, [], 'en', undefined, {
            electionData: {
                election: 'Lok Sabha General Election 2024',
                source: 'Test source',
                states: [{ name: 'Test State', constituencies: [{ name: 'Test Seat', winner: { name: 'Test Winner', party: 'Test Party', votes: 1234 }, runnerUp: { name: 'Test Runner', party: 'Other' }, turnout_pct: 61.2 }] }]
            }
        } as any);
        expect(result.agentHtml).toContain('Test Winner');
        expect(result.agentHtml).toContain('Test Seat');
        expect(result.agentHtml).not.toContain('Prashant Kishore');
    });

    it('routes to offline eligibility in mock mode', async () => {
        const { getGeminiModel } = await import('../src/aiService.js');
        (getGeminiModel as any).mockReturnValueOnce('MOCK_MODE');

        const result = await handleChat('Am I eligible to vote?');
        expect(result.agentHtml).toContain('upcoming quarterly registration cycle');
    });

    it('routes to offline booth in mock mode', async () => {
        const { getGeminiModel } = await import('../src/aiService.js');
        (getGeminiModel as any).mockReturnValueOnce('MOCK_MODE');

        const result = await handleChat('Where is my booth?');
        expect(result.agentHtml).toContain('Official ECI Electoral Search');
    });

    it('keeps offline guidance neutral for a global context without a connected source', async () => {
        const { getGeminiModel } = await import('../src/aiService.js');
        (getGeminiModel as any).mockImplementationOnce(() => { throw new Error('Guide configuration unavailable'); });

        const result = await handleChat('Where do I vote?', [], 'en', undefined, {
            user: null,
            civicContext: { label: 'Nairobi, Kenya', source: 'global_preview' },
        });

        expect(result.agentHtml).toContain('Nairobi, Kenya');
        expect(result.agentHtml).toContain('Context preview only');
        expect(result.agentHtml).not.toContain('voters.eci.gov.in');
    });

    it('uses AI for generic messages', async () => {
        const result = await handleChat('What is democracy?');
        expect(result.agentHtml).toContain('AI response text');
    });

    it('includes Hindi instruction for hi locale', async () => {
        const { getGeminiModel } = await import('../src/aiService.js');
        const mockModel = {
            models: {
                generateContent: vi.fn().mockResolvedValue({ text: 'नमस्ते' })
            }
        };
        (getGeminiModel as any).mockReturnValueOnce(mockModel);

        await handleChat('hello', [], 'hi');
        
        const call = mockModel.models.generateContent.mock.calls[0][0];
        expect(call.config.system_instruction).toContain('Hindi');
    });
});
