import { pinImageUri, type MapMemoryPin } from '@/lib/mapMemoryPins';

export type PinMarkerProps = {
    key: string;
    memoryId: string;
    variant: 'owned' | 'shared';
    imageUri: string;
    coordinate: { latitude: number; longitude: number };
};

const coordinates = new Map<string, { latitude: number; longitude: number }>();
const propsByPin = new WeakMap<MapMemoryPin, PinMarkerProps>();

/** One coordinate object per marker id so a re-render does not look like a move. */
export function cachedMarkerCoordinate(
    markerId: string,
    latitude: number,
    longitude: number,
): { latitude: number; longitude: number } {
    const existing = coordinates.get(markerId);
    if (existing && existing.latitude === latitude && existing.longitude === longitude) return existing;
    const next = { latitude, longitude };
    coordinates.set(markerId, next);
    return next;
}

/** Stable key, image, and coordinate for a pin. Same pin object returns the same props object. */
export function pinMarkerProps(pin: MapMemoryPin): PinMarkerProps {
    const imageUri = pinImageUri(pin.memory);
    const coordinate = cachedMarkerCoordinate(pin.memory.id, pin.memory.latitude, pin.memory.longitude);
    const cached = propsByPin.get(pin);
    if (
        cached
        && cached.variant === pin.variant
        && cached.imageUri === imageUri
        && cached.coordinate === coordinate
    ) {
        return cached;
    }
    const next: PinMarkerProps = {
        key: `${pin.variant}:${pin.memory.id}`,
        memoryId: pin.memory.id,
        variant: pin.variant,
        imageUri,
        coordinate,
    };
    propsByPin.set(pin, next);
    return next;
}
