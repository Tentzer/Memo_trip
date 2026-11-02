import type { MemoryPlaceCategory } from '@/types/memory';
import type { PlacePrediction } from '@/lib/places/types';

export interface SelectedSearchPlace {
    placeId: string;
    latitude: number;
    longitude: number;
    title: string;
    query: string;
    category?: MemoryPlaceCategory;
}

function finiteCoordinate(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/**
 * Map target from a search row. Brave results already include coordinates,
 * so selecting one does not look the place up again.
 */
export function selectSearchedPlace(prediction: PlacePrediction): SelectedSearchPlace | null {
    const latitude = finiteCoordinate(prediction.latitude);
    const longitude = finiteCoordinate(prediction.longitude);
    if (latitude == null || longitude == null) return null;
    const title = prediction.structured_formatting?.main_text?.trim()
        || prediction.description?.trim()
        || '';
    if (!title) return null;
    return {
        placeId: prediction.place_id,
        latitude,
        longitude,
        title,
        query: prediction.description?.trim() || title,
        category: prediction.category,
    };
}
