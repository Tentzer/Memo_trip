import { useEffect, useState } from 'react';

import { pinImageUri } from '@/lib/mapMemoryPins';
import { loadPlacePhotos } from '@/lib/places/loadPlacePhotos';
import { coverUriFromPlacePhotos } from '@/lib/places/saveSearchedPlace';
import type { Memory } from '@/types/memory';

/**
 * Pin and cluster photos. Placeholder covers are treated as missing, then one
 * cached place-details lookup can supply the Brave image. Otherwise the marker
 * draws the category icon.
 */
export function useResolvedPinImage(memory: Memory): string {
    const stored = pinImageUri(memory);
    const [fetched, setFetched] = useState('');

    useEffect(() => {
        if (stored) {
            setFetched('');
            return;
        }
        let cancelled = false;
        void loadPlacePhotos({
            id: memory.id,
            title: memory.title,
            latitude: memory.latitude,
            longitude: memory.longitude,
            placeId: memory.placeId,
        }).then((photos) => {
            if (cancelled) return;
            setFetched(coverUriFromPlacePhotos(photos) ?? '');
        }).catch(() => {
            if (!cancelled) setFetched('');
        });
        return () => {
            cancelled = true;
        };
    }, [stored, memory.id, memory.title, memory.latitude, memory.longitude, memory.placeId]);

    return stored || fetched;
}
