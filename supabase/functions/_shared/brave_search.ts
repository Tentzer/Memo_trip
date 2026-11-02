import {
    bravePlaceSearchUrl,
    mapBraveSearchResponse,
    type BraveSearchInput,
    type MappedBravePlace,
} from '../../../lib/places/bravePlace.ts';

export async function searchBravePlaces(
    input: BraveSearchInput,
    apiKey: string,
    fetchImpl: typeof fetch = fetch,
): Promise<MappedBravePlace[]> {
    const response = await fetchImpl(bravePlaceSearchUrl(input), {
        headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
        },
    });
    if (!response.ok) {
        throw new Error(`Brave place search failed (${response.status})`);
    }
    return mapBraveSearchResponse(await response.json());
}
