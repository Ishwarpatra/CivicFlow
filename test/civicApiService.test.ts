import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepresentativesByAddress, fetchPollingLocationsByAddress } from '../src/civicApiService.js';

describe('civicApiService', () => {
    beforeEach(() => {
        vi.stubEnv('GOOGLE_CIVIC_API_KEY', 'fake-key');
        vi.stubGlobal('fetch', vi.fn());
    });

    it('fetches representatives successfully', async () => {
        const mockData = {
            offices: [{ name: 'Mayor', officialIndices: [0] }],
            officials: [{ name: 'John Doe', party: 'Independent' }],
            normalizedInput: { line1: '123 Test St', city: 'Chennai', state: 'TN' }
        };

        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockData)
        });

        const result = await fetchRepresentativesByAddress('Chennai');
        expect(result.source).toBe('google_civic_api');
        expect(result.representatives[0].name).toBe('John Doe');
        expect(result.normalizedAddress).toContain('Chennai');
    });

    it('handles fetch errors gracefully', async () => {
        (fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Error')
        });

        const result = await fetchRepresentativesByAddress('Chennai');
        expect(result.source).toBe('fallback');
        expect(result.error).toContain('500');
    });

    it('fetches polling locations successfully', async () => {
        const mockData = {
            pollingLocations: [
                { address: { locationName: 'School A', line1: 'St 1', city: 'City', state: 'ST' } }
            ]
        };

        (fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockData)
        });

        const result = await fetchPollingLocationsByAddress('City');
        expect(result.source).toBe('google_civic_api');
        expect(result.pollingLocations?.[0].name).toBe('School A');
    });
});
