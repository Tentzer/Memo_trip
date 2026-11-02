import type { MapMarkerItem } from '@/lib/mapMemoryPins';
import { zoomBucketFromLongitudeDelta } from '@/lib/mapMemoryPins';
import type { Region } from 'react-native-maps';

/** Extra viewport kept mounted so a short pan does not create and destroy markers. */
export const MARKER_REGION_PADDING = 0.45;

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
export function selectVisibleMarkers(
    items: readonly MapMarkerItem[],
    region: Region | null,
    maxCount = MAX_MOUNTED_MARKERS,
): MapMarkerItem[] {
    if (!region) return [];
    const visible = items.filter((item) => {
        const coordinate = markerCoordinate(item);
        return regionContainsMarker(region, coordinate.latitude, coordinate.longitude);
    });
    if (visible.length <= maxCount) return visible;
    const ranked = [...visible].sort((a, b) => {
        const aCoord = markerCoordinate(a);
        const bCoord = markerCoordinate(b);
        const aDist = (aCoord.latitude - region.latitude) ** 2 + (aCoord.longitude - region.longitude) ** 2;
        const bDist = (bCoord.latitude - region.latitude) ** 2 + (bCoord.longitude - region.longitude) ** 2;
        return aDist - bDist;
    });
    return ranked.slice(0, maxCount);
}

export function nextMarkerMountCount(shown: number, total: number, batch = MARKER_MOUNT_BATCH): number {
    if (total <= 0) return 0;
    if (shown >= total) return total;
    return Math.min(shown + batch, total);
}
