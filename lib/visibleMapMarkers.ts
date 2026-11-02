import type { MapMarkerItem } from '@/lib/mapMemoryPins';
import { zoomBucketFromLongitudeDelta } from '@/lib/mapMemoryPins';
import type { Region } from 'react-native-maps';

/**
 * Extra viewport kept mounted, in screens, past each edge.
 * One full screen means a modest zoom-out already has those pins mounted.
 */
export const MARKER_REGION_PADDING = 1;

/**
 * Safety cap for custom Google markers. Each one is a native view plus a bitmap.
 * Applied after clustering, including neighborhood zooms where every pin is individual.
 * A fast zoom that mounts or destroys more than this in one frame crashes iOS.
 */
export const MAX_MOUNTED_MARKERS = 32;

/** How many custom markers to attach per frame after a zoom change. */
export const MARKER_MOUNT_BATCH = 8;

const REGION_SHIFT_FRACTION = 0.25;
const REGION_SPAN_FRACTION = 0.2;

export function markerItemKey(item: MapMarkerItem): string {
    return item.type === 'cluster'
        ? item.cluster.id
        : `${item.pin.variant}:${item.pin.memory.id}`;
}

export function markerCoordinate(item: MapMarkerItem): { latitude: number; longitude: number } {
    if (item.type === 'cluster') {
        return { latitude: item.cluster.latitude, longitude: item.cluster.longitude };
    }
    return { latitude: item.pin.memory.latitude, longitude: item.pin.memory.longitude };
}

export function regionContainsMarker(
    region: Region,
    latitude: number,
    longitude: number,
    padding = MARKER_REGION_PADDING,
): boolean {
    if (!Number.isFinite(region.latitudeDelta) || !Number.isFinite(region.longitudeDelta)) return false;
    if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return false;
    const latPad = region.latitudeDelta * padding;
    const lngPad = region.longitudeDelta * padding;
    const minLat = region.latitude - region.latitudeDelta / 2 - latPad;
    const maxLat = region.latitude + region.latitudeDelta / 2 + latPad;
    const minLng = region.longitude - region.longitudeDelta / 2 - lngPad;
    const maxLng = region.longitude + region.longitudeDelta / 2 + lngPad;
    return latitude >= minLat && latitude <= maxLat && longitude >= minLng && longitude <= maxLng;
}

/**
 * Zooming in keeps the wider query so those pins stay mounted.
 * A real pan starts a new area. A small nudge keeps the previous query.
 */
export function regionForMarkerQuery(previous: Region | null, next: Region): Region {
    if (!previous) return next;
    const zoomChanged = zoomBucketFromLongitudeDelta(previous.longitudeDelta)
        !== zoomBucketFromLongitudeDelta(next.longitudeDelta);
    if (!zoomChanged) {
        return shouldRefreshMarkerRegion(previous, next) ? next : previous;
    }
    return {
        latitude: next.latitude,
        longitude: next.longitude,
        latitudeDelta: Math.max(previous.latitudeDelta, next.latitudeDelta),
        longitudeDelta: Math.max(previous.longitudeDelta, next.longitudeDelta),
    };
}

export function shouldRefreshMarkerRegion(previous: Region | null, next: Region): boolean {
    if (!previous) return true;
    if (zoomBucketFromLongitudeDelta(previous.longitudeDelta) !== zoomBucketFromLongitudeDelta(next.longitudeDelta)) {
        return true;
    }
    if (Math.abs(next.latitude - previous.latitude) > previous.latitudeDelta * REGION_SHIFT_FRACTION) return true;
    if (Math.abs(next.longitude - previous.longitude) > previous.longitudeDelta * REGION_SHIFT_FRACTION) return true;
    if (previous.longitudeDelta <= 0) return true;
    return Math.abs(next.longitudeDelta - previous.longitudeDelta) / previous.longitudeDelta > REGION_SPAN_FRACTION;
}

/**
 * Markers inside the padded viewport, nearest to the center when the set exceeds the cap.
 * A null region mounts nothing so the first camera fix does not attach every memory.
 */
export function orderMarkersByKey(items: readonly MapMarkerItem[]): MapMarkerItem[] {
    return [...items].sort((a, b) => markerItemKey(a).localeCompare(markerItemKey(b)));
}

/**
 * Keeps markers that are already mounted at the same index and appends newcomers.
 * Re-sorting the whole list when a cluster splits shifts later siblings and
 * makes Fabric remount their native views.
 */
export function stableMarkerOrder(
    previous: readonly MapMarkerItem[],
    next: readonly MapMarkerItem[],
): MapMarkerItem[] {
    const nextByKey = new Map(next.map((item) => [markerItemKey(item), item]));
    const seen = new Set<string>();
    const ordered: MapMarkerItem[] = [];
    for (const item of previous) {
        const fresh = nextByKey.get(markerItemKey(item));
        if (!fresh) continue;
        ordered.push(fresh);
        seen.add(markerItemKey(item));
    }
    const newcomers = next.filter((item) => !seen.has(markerItemKey(item)));
    newcomers.sort((a, b) => markerItemKey(a).localeCompare(markerItemKey(b)));
    ordered.push(...newcomers);
    return ordered;
}

function markerDistanceSq(item: MapMarkerItem, region: Region): number {
    const coordinate = markerCoordinate(item);
    return (coordinate.latitude - region.latitude) ** 2 + (coordinate.longitude - region.longitude) ** 2;
}

function nearestMarkers(items: readonly MapMarkerItem[], region: Region, maxCount: number): MapMarkerItem[] {
    if (items.length <= maxCount) return [...items];
    return [...items].sort((a, b) => markerDistanceSq(a, region) - markerDistanceSq(b, region)).slice(0, maxCount);
}

/**
 * Markers inside the padded viewport, nearest to the center when the set exceeds the cap.
 * Keys in `retainKeys` that are still inside the padding stay mounted ahead of newcomers.
 * A null region mounts nothing so the first camera fix does not attach every memory.
 */
export function selectVisibleMarkers(
    items: readonly MapMarkerItem[],
    region: Region | null,
    maxCount = MAX_MOUNTED_MARKERS,
    retainKeys?: ReadonlySet<string>,
): MapMarkerItem[] {
    if (!region) return [];
    const visible = items.filter((item) => {
        const coordinate = markerCoordinate(item);
        return regionContainsMarker(region, coordinate.latitude, coordinate.longitude);
    });
    if (visible.length <= maxCount) return visible;
    if (!retainKeys || retainKeys.size === 0) return nearestMarkers(visible, region, maxCount);
    const retained = nearestMarkers(
        visible.filter((item) => retainKeys.has(markerItemKey(item))),
        region,
        maxCount,
    );
    if (retained.length >= maxCount) return retained;
    const retainedKeySet = new Set(retained.map((item) => markerItemKey(item)));
    const fresh = nearestMarkers(
        visible.filter((item) => !retainedKeySet.has(markerItemKey(item))),
        region,
        maxCount - retained.length,
    );
    return [...retained, ...fresh];
}

function sameMarkerSnapshot(previous: MapMarkerItem, next: MapMarkerItem): boolean {
    if (previous.type !== next.type) return false;
    if (previous.type === 'pin' && next.type === 'pin') return previous.pin === next.pin;
    if (previous.type !== 'cluster' || next.type !== 'cluster') return false;
    return previous.cluster.id === next.cluster.id
        && previous.cluster.count === next.cluster.count
        && previous.cluster.latitude === next.cluster.latitude
        && previous.cluster.longitude === next.cluster.longitude
        && previous.cluster.expansionZoom === next.cluster.expansionZoom
        && previous.cluster.hasOwned === next.cluster.hasOwned
        && previous.cluster.hasShared === next.cluster.hasShared
        && previous.cluster.newest.variant === next.cluster.newest.variant
        && previous.cluster.newest.memory.id === next.cluster.newest.memory.id
        && previous.cluster.newest.memory.uri === next.cluster.newest.memory.uri
        && previous.cluster.newest.memory.thumb_uri === next.cluster.newest.memory.thumb_uri
        && previous.cluster.newest.memory.placeCategory === next.cluster.newest.memory.placeCategory;
}

/**
 * Keeps the previous item object when the pin or cluster snapshot did not change.
 * Returns `previous` itself when the ordered list is unchanged.
 */
export function reuseStableMarkerItems(
    previous: readonly MapMarkerItem[],
    next: readonly MapMarkerItem[],
): MapMarkerItem[] {
    const previousByKey = new Map(previous.map((item) => [markerItemKey(item), item]));
    const merged = next.map((item) => {
        const prior = previousByKey.get(markerItemKey(item));
        return prior && sameMarkerSnapshot(prior, item) ? prior : item;
    });
    if (merged.length === previous.length && merged.every((item, index) => item === previous[index])) {
        return previous as MapMarkerItem[];
    }
    return merged;
}

/**
 * Drops markers that left and appends at most `batch` newcomers.
 * An empty previous list mounts the whole next list (already capped).
 * Markers that stay keep their place so a zoom does not remount them.
 */
export function planMountedMarkers(
    previous: readonly MapMarkerItem[],
    next: readonly MapMarkerItem[],
    batch = MARKER_MOUNT_BATCH,
): MapMarkerItem[] {
    const nextKeys = new Set(next.map((item) => markerItemKey(item)));
    const kept = new Set<string>();
    for (const item of previous) {
        const key = markerItemKey(item);
        if (nextKeys.has(key)) kept.add(key);
    }
    const room = previous.length === 0 ? next.length : Math.max(0, batch);
    let added = 0;
    const chosen: MapMarkerItem[] = [];
    for (const item of next) {
        const key = markerItemKey(item);
        if (kept.has(key)) {
            chosen.push(item);
            continue;
        }
        if (added < room) {
            chosen.push(item);
            added += 1;
        }
    }
    return chosen;
}

export function sameMarkerList(previous: readonly MapMarkerItem[], next: readonly MapMarkerItem[]): boolean {
    if (previous.length !== next.length) return false;
    return previous.every((item, index) => item === next[index]);
}

export function nextMarkerMountCount(shown: number, total: number, batch = MARKER_MOUNT_BATCH): number {
    if (total <= 0) return 0;
    if (shown >= total) return total;
    return Math.min(shown + batch, total);
}
