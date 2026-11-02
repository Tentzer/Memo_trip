import { describe, expect, it } from '@jest/globals';
import {
    MARKER_REGION_PADDING,
    MAX_MOUNTED_MARKERS,
    markerItemKey,
    nextMarkerMountCount,
    planMountedMarkers,
    regionForMarkerQuery,
    selectVisibleMarkers,
    shouldRefreshMarkerRegion,
    stableMarkerOrder,
} from '@/lib/visibleMapMarkers';
import type { MapMarkerItem } from '@/lib/mapMemoryPins';
import type { Region } from 'react-native-maps';

function pinAt(id: string, latitude: number, longitude: number): MapMarkerItem {
    return {
        type: 'pin',
        pin: {
            variant: 'owned',
            memory: {
                id,
                uri: `https://example.com/${id}.jpg`,
                latitude,
                longitude,
                created_at: '2026-01-01T00:00:00.000Z',
                customFolderIds: [],
            },
        },
    };
}

const region: Region = {
    latitude: 32.1,
    longitude: 34.8,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
};

describe('visible map markers', () => {
    it('keeps markers in the padded viewport and drops the rest', () => {
        const inside = pinAt('in', 32.1, 34.8);
        const edge = pinAt('edge', 32.22, 34.8);
        const outside = pinAt('out', 33.2, 34.8);
        const selected = selectVisibleMarkers([outside, inside, edge], region);
        expect(selected.map((item) => item.type === 'pin' && item.pin.memory.id)).toEqual(['in', 'edge']);
    });

    it('mounts nothing until the camera region is known', () => {
        expect(selectVisibleMarkers([pinAt('a', 32.1, 34.8)], null)).toEqual([]);
    });

    it('keeps the markers nearest the center when the viewport exceeds the cap', () => {
        const items = Array.from({ length: MAX_MOUNTED_MARKERS + 5 }, (_, index) =>
            pinAt(`p${index}`, region.latitude + index * 0.001, region.longitude),
        );
        const selected = selectVisibleMarkers(items, region);
        expect(selected).toHaveLength(MAX_MOUNTED_MARKERS);
        expect(selected[0]).toMatchObject({ type: 'pin', pin: { memory: { id: 'p0' } } });
    });

    it('refreshes after a real pan or zoom and ignores a small camera nudge', () => {
        expect(shouldRefreshMarkerRegion(null, region)).toBe(true);
        expect(shouldRefreshMarkerRegion(region, { ...region, latitude: region.latitude + 0.01 })).toBe(false);
        expect(shouldRefreshMarkerRegion(region, { ...region, latitude: region.latitude + 0.1 })).toBe(true);
        expect(shouldRefreshMarkerRegion(region, { ...region, longitudeDelta: region.longitudeDelta / 4 })).toBe(true);
    });

    it('mounts the next zoom set in batches', () => {
        expect(nextMarkerMountCount(0, 20, 8)).toBe(8);
        expect(nextMarkerMountCount(16, 20, 8)).toBe(20);
        expect(nextMarkerMountCount(0, 0, 8)).toBe(0);
    });

    it('keeps already mounted pins and adds one batch of newcomers', () => {
        const previous = Array.from({ length: 10 }, (_, index) =>
            pinAt(`p${index}`, region.latitude, region.longitude + index * 0.0001),
        );
        const next = Array.from({ length: 20 }, (_, index) =>
            pinAt(`p${index}`, region.latitude, region.longitude + index * 0.0001),
        );
        const frame = planMountedMarkers(previous, next, 8);
        expect(frame).toHaveLength(18);
        for (const item of previous) {
            expect(frame.map(markerItemKey)).toContain(markerItemKey(item));
        }
        expect(planMountedMarkers([], next, 8)).toHaveLength(next.length);
    });

    it('keeps a mounted pin that is still in view when nearer pins would fill the cap', () => {
        const items = Array.from({ length: MAX_MOUNTED_MARKERS + 8 }, (_, index) =>
            pinAt(`p${index}`, region.latitude + index * 0.001, region.longitude),
        );
        const farId = `p${MAX_MOUNTED_MARKERS + 6}`;
        const selected = selectVisibleMarkers(items, region, MAX_MOUNTED_MARKERS, new Set([`owned:${farId}`]));
        expect(selected).toHaveLength(MAX_MOUNTED_MARKERS);
        expect(selected.map(markerItemKey)).toContain(`owned:${farId}`);
        const nearestOnly = selectVisibleMarkers(items, region);
        expect(nearestOnly.map(markerItemKey)).not.toContain(`owned:${farId}`);
    });

    it('keeps a pin one screen outside the viewport and drops one farther away', () => {
        const inside = pinAt('in', region.latitude, region.longitude);
        const oneScreen = pinAt('pad', region.latitude + region.latitudeDelta, region.longitude);
        const farther = pinAt('far', region.latitude + region.latitudeDelta * 2, region.longitude);
        const selected = selectVisibleMarkers([farther, oneScreen, inside], region);
        expect(MARKER_REGION_PADDING).toBe(1);
        expect(selected.map(markerItemKey)).toEqual(['owned:pad', 'owned:in']);
        expect(selected.map(markerItemKey)).not.toContain('owned:far');
    });

    it('keeps the wider span while zooming in and follows a real pan', () => {
        const zoomedOut = { ...region, latitudeDelta: 0.8, longitudeDelta: 0.8 };
        const zoomedIn = { ...region, latitudeDelta: 0.2, longitudeDelta: 0.2 };
        expect(regionForMarkerQuery(zoomedOut, zoomedIn).longitudeDelta).toBe(0.8);
        const nudged = { ...region, latitude: region.latitude + 0.01 };
        expect(regionForMarkerQuery(region, nudged)).toBe(region);
        const panned = { ...region, latitude: region.latitude + 0.1 };
        expect(regionForMarkerQuery(region, panned)).toBe(panned);
    });

    it('keeps an existing pin at its index when a new pin would sort before it', () => {
        const kept = pinAt('m', region.latitude, region.longitude);
        const added = pinAt('a', region.latitude, region.longitude);
        expect(stableMarkerOrder([kept], [added, kept]).map(markerItemKey)).toEqual(['owned:m', 'owned:a']);
    });
});
