import type { MemoryPlaceCategory } from '@/types/memory';

/**
 * Individual pins show a category badge only when the memory has one.
 * Clusters never show one, even if their newest photo has a category.
 */
export function categoryBadgeForMapMarker(
    marker: { type: 'pin'; placeCategory?: MemoryPlaceCategory | null } | { type: 'cluster' },
): MemoryPlaceCategory | null {
    if (marker.type === 'cluster') return null;
    return marker.placeCategory ?? null;
}
