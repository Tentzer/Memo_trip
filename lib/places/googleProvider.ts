import {
    fetchGooglePlaceDetails,
    fetchGooglePlacePhotoReference,
    fetchGooglePlacePredictions,
} from '@/lib/googlePlaces';
import { mapGooglePlaceCategory } from '@/lib/places/placeCategorySignals';
import type { PlaceBias, PlaceLookupHint, PlacePrediction, PlacesClient } from '@/lib/places/types';

function googleKey(): string | undefined {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    return key || undefined;
}

function hintTitle(placeId: string, hint?: PlaceLookupHint): string {
    return hint?.title?.trim() || hint?.description?.trim() || placeId;
}

async function googleNearby(
    query: string,
    bias: PlaceBias,
    radiusMeters = 3000,
): Promise<PlacePrediction[]> {
    const key = googleKey();
    if (!key || !query.trim()) return [];
    const params = new URLSearchParams({
        query: query.trim(),
        location: `${bias.latitude},${bias.longitude}`,
        radius: String(radiusMeters),
        key,
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`);
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : [];
    return results.slice(0, 20).flatMap((result) => {
        const placeId = typeof result.place_id === 'string' ? result.place_id : '';
        const name = typeof result.name === 'string' ? result.name : '';
        if (!placeId || !name) return [];
        const address = typeof result.formatted_address === 'string' ? result.formatted_address : '';
        const geometry = result.geometry as { location?: { lat?: number; lng?: number } } | undefined;
        const types = Array.isArray(result.types) ? result.types as string[] : [];
        return [{
            place_id: placeId,
            description: address ? `${name}, ${address}` : name,
            structured_formatting: { main_text: name, secondary_text: address },
            latitude: geometry?.location?.lat,
            longitude: geometry?.location?.lng,
            address,
            category: mapGooglePlaceCategory({ name, types }),
            rating: typeof result.rating === 'number' ? result.rating : undefined,
            reviewCount: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : undefined,
        }];
    });
}

export function createGooglePlacesClient(): PlacesClient {
    return {
        search(query) {
            return fetchGooglePlacePredictions(query, googleKey());
        },
        nearby(query, bias, radiusMeters) {
            return googleNearby(query, bias, radiusMeters);
        },
        details(placeId, hint) {
            return fetchGooglePlaceDetails(placeId, hintTitle(placeId, hint), googleKey());
        },
        async photos(placeId) {
            const reference = await fetchGooglePlacePhotoReference(placeId, googleKey());
            return reference ? [reference] : [];
        },
    };
}
