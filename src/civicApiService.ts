/**
 * Civic Information API service.
 * The provider is an optional integration; callers must inspect status before
 * presenting data as live civic information.
 */

export interface CivicRepresentative {
    name: string;
    party?: string;
    office?: string;
    photoUrl?: string;
    urls?: string[];
    phones?: string[];
}

export type CivicProviderStatus = 'live' | 'misconfigured' | 'rate_limited' | 'unavailable';

export interface CivicApiResult {
    representatives: CivicRepresentative[];
    pollingLocations?: { address: string; name: string }[];
    normalizedAddress?: string;
    source: 'google_civic_api' | 'fallback';
    status: CivicProviderStatus;
    error?: string;
}

function providerError(status: CivicProviderStatus, error: string): CivicApiResult {
    return { representatives: [], source: 'fallback', status, error };
}

function httpStatus(response: Response): CivicProviderStatus {
    return response.status === 429 ? 'rate_limited' : 'unavailable';
}

export async function fetchRepresentativesByAddress(address: string): Promise<CivicApiResult> {
    if (!/\bIndia\b/i.test(address)) return providerError('unavailable', 'Civic lookup requires an India-scoped address');
    const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
    if (!apiKey) return providerError('misconfigured', 'GOOGLE_CIVIC_API_KEY not configured');

    const encodedAddress = encodeURIComponent(address);
    const url = `https://civicinfo.googleapis.com/civicinfo/v2/representatives?address=${encodedAddress}&key=${apiKey}&levels=country&levels=administrativeArea1&roles=legislatorUpperBody&roles=legislatorLowerBody`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return providerError(httpStatus(response), `Civic API error: ${response.status}`);

        interface CivicApiResponse {
            offices?: Array<{ name: string; officialIndices?: number[] }>;
            officials?: Array<{ name: string; party?: string; photoUrl?: string; urls?: string[]; phones?: string[] }>;
            normalizedInput?: { line1?: string; city?: string; state?: string };
        }
        const data = await response.json() as CivicApiResponse;
        const reps: CivicRepresentative[] = [];
        for (const office of data.offices || []) {
            for (const idx of office.officialIndices || []) {
                const official = data.officials?.[idx];
                if (!official) continue;
                reps.push({
                    name: official.name,
                    party: official.party,
                    office: office.name,
                    photoUrl: official.photoUrl,
                    urls: official.urls,
                    phones: official.phones,
                });
            }
        }

        const normalizedAddress = data.normalizedInput
            ? [data.normalizedInput.line1, data.normalizedInput.city, data.normalizedInput.state].filter(Boolean).join(', ')
            : address;
        return { representatives: reps, normalizedAddress, source: 'google_civic_api', status: 'live' };
    } catch (error: unknown) {
        return providerError('unavailable', error instanceof Error ? error.message : String(error));
    }
}

export async function fetchPollingLocationsByAddress(address: string): Promise<CivicApiResult> {
    if (!/\bIndia\b/i.test(address)) return providerError('unavailable', 'Polling lookup requires an India-scoped address');
    const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
    if (!apiKey) return providerError('misconfigured', 'GOOGLE_CIVIC_API_KEY not configured');

    const encodedAddress = encodeURIComponent(address);
    const electionId = process.env.GOOGLE_CIVIC_ELECTION_ID || '2000';
    const url = `https://civicinfo.googleapis.com/civicinfo/v2/voterinfo?address=${encodedAddress}&electionId=${electionId}&key=${apiKey}`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return providerError(httpStatus(response), `Civic API error: ${response.status}`);

        interface VoterInfoResponse {
            pollingLocations?: Array<{ address?: { locationName?: string; line1?: string; city?: string; state?: string } }>;
        }
        const data = await response.json() as VoterInfoResponse;
        const locations = (data.pollingLocations || []).map((location) => ({
            name: location.address?.locationName || 'Polling Location',
            address: [location.address?.line1, location.address?.city, location.address?.state].filter(Boolean).join(', '),
        }));
        return { representatives: [], pollingLocations: locations, source: 'google_civic_api', status: 'live' };
    } catch (error: unknown) {
        return providerError('unavailable', error instanceof Error ? error.message : String(error));
    }
}
