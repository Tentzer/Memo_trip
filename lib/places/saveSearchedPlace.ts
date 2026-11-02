import { placePhotoUri } from '@/lib/places/placePhoto';
import type { PlacePhoto, PlacePrediction } from '@/lib/places/types';
import type { MemoryPlaceCategory } from '@/types/memory';

import { selectSearchedPlace, type SelectedSearchPlace } from './selectPlace';

export const PLACEHOLDER_PLACE_PHOTO = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

export function coverUriFromPlacePhotos(photos: PlacePhoto[] | null | undefined): string | null {
    const first = photos?.find((photo) => photo.full?.trim() || photo.thumb?.trim());
    if (!first) return null;
    return first.full?.trim() || first.thumb.trim();
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
            const first = photos.find((uri) => uri?.trim());
            if (first) {
                return placePhotoUri(first, process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) ?? first.trim();
            }
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
        options?: { placeCategory?: MemoryPlaceCategory },
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
        { placeCategory: selected.category },
    );
    return { selected, photoUri };
}
