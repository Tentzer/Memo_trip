import { type Memory } from '@/context/MemoryContext';

type MapMemoryEntry = {
    memory: Memory;
    variant: 'owned' | 'shared';
};

/**
 * Finds the memo marker closest to a map tap. Used when Google Maps custom
 * marker hit targets drift after pan/zoom.
 */
export function findNearestMapMemory(
    latitude: number,
    longitude: number,
    markers: MapMemoryEntry[],
    latitudeDelta: number,
): Memory | null {
    if (markers.length === 0) return null;

    const maxDistance = latitudeDelta * 0.08;
    let nearest: { memory: Memory; distance: number } | null = null;

    for (const { memory } of markers) {
        const dLat = memory.latitude - latitude;
        const dLng = memory.longitude - longitude;
        const distance = Math.hypot(dLat, dLng);
        if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
            nearest = { memory, distance };
        }
    }

    return nearest?.memory ?? null;
}
