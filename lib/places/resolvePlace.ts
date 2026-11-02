import { getPlacesClient } from '@/lib/places/client';
import { hintForPrediction } from '@/lib/places/braveProvider';
import { placePhotoUri } from '@/lib/places/placePhoto';
import type { MemoryPlaceCategory } from '@/types/memory';

const PLACEHOLDER_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

export interface ResolvedPlaceQuery {
    placeId: string;
    lat: number;
    lng: number;
    photoReference: string | null;
    photoUri: string;
    country: string | null;
    category?: MemoryPlaceCategory;
}

/** Search, then load details and photos for a place card. Returns null when nothing matches. */
export async function resolvePlaceQuery(
    query: string,
    title: string,
    photoMaxWidth = 1200,
): Promise<ResolvedPlaceQuery | null> {
    const client = getPlacesClient();
    const predictions = await client.search(query);
    const first = predictions[0];
    if (!first) return null;

    const hint = { ...hintForPrediction(first), title: title || hintForPrediction(first).title };
    const details = await client.details(first.place_id, hint);
    if (!details) return null;

    const photos = await client.photos(first.place_id, hint);
    const photoReference = photos[0] ?? null;
    const photoUri = placePhotoUri(
        photoReference,
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        photoMaxWidth,
    ) ?? PLACEHOLDER_PHOTO;

    return {
        placeId: first.place_id,
        lat: details.latitude,
        lng: details.longitude,
        photoReference,
        photoUri,
        country: details.country,
        category: details.category ?? first.category,
    };
}
