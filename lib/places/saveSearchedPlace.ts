import { placePhotoUri } from '@/lib/places/placePhoto';
import type { PlacePhoto, PlacePrediction } from '@/lib/places/types';
import type { MemoryPlaceCategory } from '@/types/memory';

import { selectSearchedPlace, type SelectedSearchPlace } from './selectPlace';

export const PLACEHOLDER_PLACE_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

/** The generated question-mark image, or an empty value, is not a place photo. */
export function isPlaceholderPhoto(uri: string | null | undefined): boolean {
    const value = uri?.trim().toLowerCase() ?? '';
    if (!value) return true;
    if (value.includes('placehold.co')) return true;
    if (value.includes('text=?') || value.includes('text=%3f')) return true;
    return false;
}

export function coverUriFromPlacePhotos(photos: PlacePhoto[] | null | undefined): string | null {
    for (const photo of photos ?? []) {
        const thumb = photo.thumb?.trim() ?? '';
        const full = photo.full?.trim() ?? '';
        const proxied = thumb.includes('imgs.search.brave.com') ? thumb : '';
        const candidate = proxied || full || thumb;
        if (candidate && !isPlaceholderPhoto(candidate)) return candidate;
    }
    return null;
}

/** Cover image already attached to a Brave search row, if any. */
export function coverUriFromPrediction(prediction: PlacePrediction): string | null {
    return coverUriFromPlacePhotos(prediction.placePhotos);
}

/**
 * Prefer photos from the search result. Otherwise wait for a details/photos fetch.
 * A place with no pictures still returns a placeholder and does not throw.
 */
export async function resolveSearchCoverUri(
    prediction: PlacePrediction,
    fetchPhotoUris?: (prediction: PlacePrediction) => Promise<string[]>,
): Promise<string> {
    const ready = coverUriFromPrediction(prediction);
    if (ready) return ready;
    if (fetchPhotoUris) {
        try {
            const photos = await fetchPhotoUris(prediction);
            const first = photos
                .map((uri) => placePhotoUri(uri, process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) ?? uri?.trim())
                .find((uri) => uri && !isPlaceholderPhoto(uri));
            if (first) return first;
        } catch {
            // Save the place anyway.
        }
    }
    return PLACEHOLDER_PLACE_PHOTO;
}

export interface SaveSearchedPlaceInput {
    prediction: PlacePrediction;
    country?: string;
    description?: string;
    addPlaceMemory: (
        photoUri: string,
        lat: number,
        lng: number,
        country: string,
        description?: string,
        title?: string,
        options?: { placeCategory?: MemoryPlaceCategory; placeId?: string },
    ) => Promise<void>;
    fetchPhotoUris?: (prediction: PlacePrediction) => Promise<string[]>;
}

export async function saveSearchedPlace(input: SaveSearchedPlaceInput): Promise<{
    selected: SelectedSearchPlace;
    photoUri: string;
}> {
    const selected = selectSearchedPlace(input.prediction);
    if (!selected) {
        throw new Error('This place has no coordinates.');
    }
    const photoUri = await resolveSearchCoverUri(input.prediction, input.fetchPhotoUris);
    await input.addPlaceMemory(
        photoUri,
        selected.latitude,
        selected.longitude,
        input.country ?? '',
        input.description,
        selected.title,
        { placeCategory: selected.category, placeId: selected.placeId },
    );
    return { selected, photoUri };
}
