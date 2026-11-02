import { useEffect, useState } from 'react';

import { loadPlacePhotos, type PlacePhotoSource } from '@/lib/places/loadPlacePhotos';
import type { PlacePhoto } from '@/lib/places/placePhotos';
import { readSessionPlacePhotos } from '@/lib/places/placePhotoSession';
import type { Memory } from '@/types/memory';

export type { PlacePhoto } from '@/lib/places/placePhotos';

export type PlacePhotoMemory = Pick<Memory, 'id' | 'title' | 'latitude' | 'longitude'> & {
    placeId?: string;
};

export interface UsePlacePhotosResult {
    photos: PlacePhoto[];
    loading: boolean;
    error: string | null;
}

const EMPTY: UsePlacePhotosResult = { photos: [], loading: false, error: null };

function canLoad(memory: PlacePhotoSource): boolean {
    if (!Number.isFinite(memory.latitude) || !Number.isFinite(memory.longitude)) return false;
    return Boolean(memory.placeId?.trim() || memory.title?.trim());
}

/**
 * Loads up to 5 place photos when a memory detail sheet mounts.
 * Does nothing while the map is merely browsing, because nothing on the map calls this hook.
 */
export function usePlacePhotos(memory: PlacePhotoMemory | Memory | null | undefined): UsePlacePhotosResult {
    const [state, setState] = useState<UsePlacePhotosResult>(EMPTY);
    const memoryId = memory?.id;
    const title = memory?.title;
    const latitude = memory?.latitude;
    const longitude = memory?.longitude;
    const placeId = memory && 'placeId' in memory ? memory.placeId : undefined;

    useEffect(() => {
        if (latitude == null || longitude == null) {
            setState(EMPTY);
            return;
        }
        const source: PlacePhotoSource = { id: memoryId, title, latitude, longitude, placeId };
        if (!canLoad(source)) {
            setState(EMPTY);
            return;
        }
        const cached = readSessionPlacePhotos(source);
        if (cached) {
            setState({ photos: cached, loading: false, error: null });
            return;
        }
        let cancelled = false;
        setState({ photos: [], loading: true, error: null });
        loadPlacePhotos(source)
            .then((photos) => {
                if (!cancelled) setState({ photos, loading: false, error: null });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const message = err instanceof Error && err.message.trim()
                    ? err.message
                    : 'Could not load place photos.';
                setState({ photos: [], loading: false, error: message });
            });
        return () => {
            cancelled = true;
        };
    }, [memoryId, title, latitude, longitude, placeId]);

    return state;
}
