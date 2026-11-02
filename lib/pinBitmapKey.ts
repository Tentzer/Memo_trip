import { formatClusterCount } from '@/lib/mapMemoryPins';
import type { MemoryPlaceCategory } from '@/types/memory';

export const PIN_BITMAP_PLACEHOLDER_KEY = 'placeholder:v1';

export type PinBitmapInput = {
    memoryId: string;
    imageUri: string;
    badge: MemoryPlaceCategory | null;
    variant: 'owned' | 'shared';
    selected: boolean;
    video: boolean;
};

export type ClusterBitmapInput = {
    count: number;
    imageUri: string;
    frame: 'owned' | 'shared';
    ring: 'owned' | 'shared' | 'mixed' | 'video';
    variant: 'owned' | 'shared';
};

/** Displayed count, so 100 and 240 share the 99+ bitmap. */
export function clusterCountBucket(count: number): string {
    return formatClusterCount(count);
}

export function pinBitmapKey(input: PinBitmapInput): string {
    return [
        'pin',
        input.memoryId,
        input.imageUri,
        input.badge ?? 'none',
        input.variant,
        input.selected ? 'selected' : 'idle',
        input.video ? 'video' : 'photo',
    ].join('|');
}

export function clusterBitmapKey(input: ClusterBitmapInput): string {
    return [
        'cluster',
        clusterCountBucket(input.count),
        input.frame,
        input.ring,
        input.variant,
        input.imageUri,
    ].join('|');
}

export type BitmapSpec =
    | ({ kind: 'pin' } & PinBitmapInput)
    | ({ kind: 'cluster' } & ClusterBitmapInput)
    | { kind: 'placeholder' };

export function bitmapKeyForSpec(spec: BitmapSpec): string {
    if (spec.kind === 'placeholder') return PIN_BITMAP_PLACEHOLDER_KEY;
    if (spec.kind === 'pin') return pinBitmapKey(spec);
    return clusterBitmapKey(spec);
}

export function pinBitmapFileName(key: string): string {
    let hash = 5381;
    for (let index = 0; index < key.length; index += 1) {
        hash = ((hash << 5) + hash) ^ key.charCodeAt(index);
    }
    return `pin-${(hash >>> 0).toString(16)}.png`;
}
