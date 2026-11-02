import type { PlacePhoto, PlacePhotosResult } from '@/lib/placePhotoGallery';
import type { Memory } from '@/types/memory';

/**
 * Stand-in for the place-photo hook being built on the Brave branch.
 * Replace this import with the real `usePlacePhotos` when that hook lands.
 * Dev builds return sample photos so the carousel can be tried. Release builds return none.
 */
const DEV_MOCK_PLACE_PHOTOS: PlacePhoto[] = [
    {
        thumb: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=480&q=60',
        full: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=70',
    },
    {
        thumb: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=480&q=60',
        full: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=70',
    },
    {
        thumb: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=480&q=60',
        full: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1600&q=70',
    },
];

const EMPTY: PlacePhotosResult = { photos: [], loading: false, error: null };
const DEV_RESULT: PlacePhotosResult = { photos: DEV_MOCK_PLACE_PHOTOS, loading: false, error: null };

export function usePlacePhotos(memory: Memory | null): PlacePhotosResult {
    if (!__DEV__ || !memory?.uri) return EMPTY;
    return DEV_RESULT;
}
