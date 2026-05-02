/**
 * Civic Information API service
 * Calls Google Civic Information API (civicinfo.googleapis.com) to return
 * real representative and polling location data by address.
 */

export interface CivicRepresentative {
    name: string;
    party?: string;
    office?: string;
    photoUrl?: string;
    urls?: string[];
    phones?: string[];
}

export interface CivicApiResult {
    representatives: CivicRepresentative[];
    pollingLocations?: { address: string; name: string }[];
    normalizedAddress?: string;
    source: 'google_civic_api' | 'fallback';
    error?: string;
}

/**
 * Fetches representatives for a given address from Google Civic Information API.
 * Falls back gracefully if the API key is missing or request fails.
 */
export async function fetchRepresentativesByAddress(address: string): Promise<CivicApiResult> {
    const apiKey = process.env.GOOGLE_CIVIC_API_KEY;

    if (!apiKey) {
        return {
            representatives: [],
            source: 'fallback',
            error: 'GOOGLE_CIVIC_API_KEY not configured',
        };
    }

    const encodedAddress = encodeURIComponent(address);
    const url = `https://civicinfo.googleapis.com/civicinfo/v2/representatives?address=${encodedAddress}&key=${apiKey}&levels=country&levels=administrativeArea1&roles=legislatorUpperBody&roles=legislatorLowerBody`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
            const errText = await response.text();
            return { representatives: [], source: 'fallback', error: `Civic API error: ${response.status}` };
        }

        interface CivicApiResponse {
            offices?: Array<{ name: string; officialIndices?: number[] }>;
            officials?: Array<{ name: string; party?: string; photoUrl?: string; urls?: string[]; phones?: string[] }>;
            normalizedInput?: { line1?: string; city?: string; state?: string };
        }
        const data = await response.json() as CivicApiResponse;

        // Map offices → officials
        const reps: CivicRepresentative[] = [];
        const offices = data.offices || [];
        const officials = data.officials || [];

        for (const office of offices) {
            const indices: number[] = office.officialIndices || [];
            for (const idx of indices) {
                const official = officials[idx];
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

        return { representatives: reps, normalizedAddress, source: 'google_civic_api' };
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { representatives: [], source: 'fallback', error: errorMessage };
    }
}

/**
 * Fetches polling locations for a given address from Google Civic Information API.
 */
export async function fetchPollingLocationsByAddress(address: string): Promise<CivicApiResult> {
    const apiKey = process.env.GOOGLE_CIVIC_API_KEY;

    if (!apiKey) {
        return { representatives: [], source: 'fallback', error: 'GOOGLE_CIVIC_API_KEY not configured' };
    }

    const encodedAddress = encodeURIComponent(address);
    const electionId = process.env.GOOGLE_CIVIC_ELECTION_ID || '2000'; // 2000 = upcoming elections feed
    const url = `https://civicinfo.googleapis.com/civicinfo/v2/voterinfo?address=${encodedAddress}&electionId=${electionId}&key=${apiKey}`;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
            return { representatives: [], source: 'fallback', error: `Civic API error: ${response.status}` };
        }

        interface VoterInfoResponse {
            pollingLocations?: Array<{
                address?: { locationName?: string; line1?: string; city?: string; state?: string };
            }>;
        }
        const data = await response.json() as VoterInfoResponse;
        const locations: { address: string; name: string }[] = (data.pollingLocations || []).map((loc) => ({
            name: loc.address?.locationName || 'Polling Location',
            address: [loc.address?.line1, loc.address?.city, loc.address?.state].filter(Boolean).join(', '),
        }));

        return { representatives: [], pollingLocations: locations, source: 'google_civic_api' };
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return { representatives: [], source: 'fallback', error: errorMessage };
    }
}
