import { describe, expect, it } from '@jest/globals';
import {
    MAX_CLUSTER_ZOOM,
    clusterMapPins,
    clusterRadiusMeters,
    filterOwnedMapMemories,
    filterSharedMapMemories,
    formatClusterCount,
    isValidMapCoordinate,
    longitudeDeltaForZoom,
    pinImageUri,
    toMapMemoryPins,
    zoomBucketFromLongitudeDelta,
    type MapMarkerItem,
    type MapMemoryPin,
} from '@/lib/mapMemoryPins';
import type { Memory } from '@/types/memory';

const METERS_PER_LATITUDE_DEGREE = 111_320;

function memory(id: string, overrides: Partial<Memory> = {}): Memory {
    return {
        id,
        uri: `https://example.com/${id}.jpg`,
        latitude: 32,
        longitude: 34,
        created_at: '2026-01-01T00:00:00.000Z',
        customFolderIds: [],
        ...overrides,
    };
}

function pin(id: string, latitude: number, variant: 'owned' | 'shared', createdAt: string): MapMemoryPin {
    return {
        variant,
        memory: memory(id, { latitude, longitude: 34, created_at: createdAt }),
    };
}

function northOf(latitude: number, meters: number): number {
    return latitude + meters / METERS_PER_LATITUDE_DEGREE;
}

function memberCount(items: MapMarkerItem[]): number {
    return items.reduce((sum, item) => sum + (item.type === 'pin' ? 1 : item.cluster.count), 0);
}

describe('map pin filtering', () => {
    const owned = [
        memory('live', { country: 'Italy', customFolderIds: ['food'] }),
        memory('archived', { deletedAt: '2026-02-01T00:00:00.000Z', country: 'Italy', customFolderIds: ['food'] }),
        memory('hidden-country', { country: 'Italy', excludeFromCountryFolder: true, customFolderIds: ['food'] }),
        memory('france', { country: 'France', customFolderIds: ['walks'] }),
        memory('unknown', { customFolderIds: ['food'] }),
    ];
    const shared = [
        memory('shared-live', { country: 'Italy', customFolderIds: ['food'], isShared: true }),
        memory('shared-archived', {
            deletedAt: '2026-02-01T00:00:00.000Z',
            country: 'Italy',
            customFolderIds: ['food'],
            isShared: true,
        }),
        memory('shared-hidden', {
            country: 'Italy',
            excludeFromCountryFolder: true,
            customFolderIds: ['food'],
            isShared: true,
        }),
    ];

    it('hides archived owned memos and keeps every shared memo when no filter is set', () => {
        expect(filterOwnedMapMemories(owned, null).map((item) => item.id)).toEqual([
            'live',
            'hidden-country',
            'france',
            'unknown',
        ]);
        expect(filterSharedMapMemories(shared, null).map((item) => item.id)).toEqual([
            'shared-live',
            'shared-archived',
            'shared-hidden',
        ]);
    });

    it('filters a custom library without dropping archived shared memos', () => {
        const filter = { mode: 'custom' as const, id: 'food', name: 'Food' };
        expect(filterOwnedMapMemories(owned, filter).map((item) => item.id)).toEqual([
            'live',
            'hidden-country',
            'unknown',
        ]);
        expect(filterSharedMapMemories(shared, filter).map((item) => item.id)).toEqual([
            'shared-live',
            'shared-archived',
            'shared-hidden',
        ]);
    });

    it('filters the current country across the selected libraries', () => {
        const filter = {
            mode: 'custom-multi' as const,
            ids: ['food'],
            names: ['Food'],
            country: 'Italy',
        };
        expect(filterOwnedMapMemories(owned, filter).map((item) => item.id)).toEqual([
            'live',
            'hidden-country',
        ]);
        expect(filterSharedMapMemories(shared, filter).map((item) => item.id)).toEqual([
            'shared-live',
            'shared-hidden',
        ]);
    });

    it('filters a country folder and treats a missing country as Unknown Location', () => {
        const italy = { mode: 'country' as const, id: 'Italy', name: 'Italy' };
        expect(filterOwnedMapMemories(owned, italy).map((item) => item.id)).toEqual(['live']);
        expect(filterSharedMapMemories(shared, italy).map((item) => item.id)).toEqual([
            'shared-live',
            'shared-archived',
        ]);
        const unknown = { mode: 'country' as const, id: 'unknown', name: 'Unknown Location' };
        expect(filterOwnedMapMemories(owned, unknown).map((item) => item.id)).toEqual(['unknown']);
    });
});

describe('map pin images and coordinates', () => {
    it('uses thumb_uri and falls back to uri', () => {
        expect(pinImageUri(memory('a', { thumb_uri: ' https://cdn/thumb.jpg ' }))).toBe('https://cdn/thumb.jpg');
        expect(pinImageUri(memory('a', { thumb_uri: '   ' }))).toBe('https://example.com/a.jpg');
        expect(pinImageUri(memory('a'))).toBe('https://example.com/a.jpg');
        expect(pinImageUri({ uri: '   ', thumb_uri: '' })).toBe('');
    });

    it('rejects coordinates that cannot be drawn', () => {
        expect(isValidMapCoordinate(32, 34)).toBe(true);
        expect(isValidMapCoordinate(0, 0)).toBe(false);
        expect(isValidMapCoordinate(91, 0)).toBe(false);
        expect(isValidMapCoordinate(0, 181)).toBe(false);
        expect(isValidMapCoordinate(Number.NaN, 10)).toBe(false);
    });

    it('drops invalid coordinates when building pins', () => {
        const pins = toMapMemoryPins(
            [memory('ok', { latitude: 10, longitude: 10 }), memory('zero', { latitude: 0, longitude: 0 })],
            [memory('shared', { latitude: 11, longitude: 11 })],
        );
        expect(pins.map((item) => [item.variant, item.memory.id])).toEqual([
            ['owned', 'ok'],
            ['shared', 'shared'],
        ]);
    });
});

describe('map pin clustering', () => {
    const zoom = 14;
    const radius = clusterRadiusMeters(zoom);
    const origin = 32;
    const near = pin('a', origin, 'owned', '2026-01-01T00:00:00.000Z');
    const closer = pin('b', northOf(origin, radius * 0.4), 'shared', '2026-04-01T00:00:00.000Z');
    const far = pin('c', northOf(origin, radius * 4), 'owned', '2026-05-01T00:00:00.000Z');

    it('clusters nearby pins, keeps distant pins, and preserves every member', () => {
        const items = clusterMapPins([far, closer, near], zoom);
        expect(memberCount(items)).toBe(3);
        const cluster = items.find((item) => item.type === 'cluster');
        const solo = items.find((item) => item.type === 'pin');
        expect(cluster?.type === 'cluster' && cluster.cluster.count).toBe(2);
        if (cluster?.type !== 'cluster' || solo?.type !== 'pin') {
            throw new Error('expected one cluster and one pin');
        }
        expect(cluster.cluster.members.map((member) => member.memory.id)).toEqual(['a', 'b']);
        expect(cluster.cluster.newest.memory.id).toBe('b');
        expect(cluster.cluster.hasOwned).toBe(true);
        expect(cluster.cluster.hasShared).toBe(true);
        expect(solo.pin.memory.id).toBe('c');
        expect(cluster.cluster.latitude).toBeCloseTo((near.memory.latitude + closer.memory.latitude) / 2);
    });

    it('uses the same cluster for either input order', () => {
        expect(clusterMapPins([closer, near], zoom)).toEqual(clusterMapPins([near, closer], zoom));
    });

    it('shows grouped memories as individual pins at max zoom', () => {
        const items = clusterMapPins([near, closer], MAX_CLUSTER_ZOOM);
        expect(items.map((item) => item.type)).toEqual(['pin', 'pin']);
        expect(zoomBucketFromLongitudeDelta(longitudeDeltaForZoom(MAX_CLUSTER_ZOOM))).toBe(MAX_CLUSTER_ZOOM);
        expect(zoomBucketFromLongitudeDelta(0.01)).toBe(15);
    });

    it('formats the count badge', () => {
        expect(formatClusterCount(2)).toBe('2');
        expect(formatClusterCount(100)).toBe('99+');
    });
});
