import { UNKNOWN_COUNTRY_FOLDER } from '@/lib/countryFolder';
import type { Memory } from '@/types/memory';

export type MapPinVariant = 'owned' | 'shared';

export type MapMemoryPin = {
    memory: Memory;
    variant: MapPinVariant;
};

export type MapLibraryFilter =
    | { mode: 'country'; id: string; name: string }
    | { mode: 'custom'; id: string; name: string }
    | { mode: 'custom-multi'; ids: string[]; names: string[]; country: string };

export type MapPinCluster = {
    id: string;
    latitude: number;
    longitude: number;
    count: number;
    newest: MapMemoryPin;
    hasOwned: boolean;
    hasShared: boolean;
    members: MapMemoryPin[];
    /** Zoom at which this cluster splits. From supercluster's getClusterExpansionZoom. */
    expansionZoom: number;
};

export type MapMarkerItem =
    | { type: 'pin'; pin: MapMemoryPin }
    | { type: 'cluster'; cluster: MapPinCluster };

/**
 * At this zoom and closer, memories stay individual pins.
 * Zoom 14 is a neighborhood view, so businesses around you are not grouped yet.
 * Clustering starts at zoom 13 and farther.
 */
export const MAX_CLUSTER_ZOOM = 14;
/** Ground radius, in screen pixels, once clustering is on. About 840 m at zoom 13. */
export const CLUSTER_RADIUS_PX = 44;

const METERS_PER_PIXEL_AT_EQUATOR_ZOOM_0 = 156543.03392;

export function isValidMapCoordinate(latitude: number, longitude: number): boolean {
    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0)
    );
}

export function pinImageUri(memory: Pick<Memory, 'uri' | 'thumb_uri'>): string {
    const thumb = memory.thumb_uri?.trim();
    if (thumb) return thumb;
    return memory.uri?.trim() ?? '';
}

export function formatClusterCount(count: number): string {
    if (count > 99) return '99+';
    return String(count);
}

export function zoomFromLongitudeDelta(longitudeDelta: number): number {
    if (!Number.isFinite(longitudeDelta) || longitudeDelta <= 0) return MAX_CLUSTER_ZOOM;
    return Math.log2(360 / longitudeDelta);
}

export function zoomBucketFromLongitudeDelta(longitudeDelta: number): number {
    return Math.round(zoomFromLongitudeDelta(longitudeDelta));
}

/**
 * Camera-idle callbacks arrive in a burst while a pinch decelerates.
 * Wait until that burst stops before querying the cluster index.
 * The native marker-insert guard is what stops the fast-zoom crash.
 */
export const CLUSTER_ZOOM_SETTLE_MS = 120;

/** Stay on the current bucket when zoom only jitters across a rounding boundary. */
export const CLUSTER_ZOOM_BUCKET_MARGIN = 0.12;

export type ClusterZoomGate = {
    committedZoom: number;
    pendingZoom: number | null;
    pendingAtMs: number | null;
};

export function createClusterZoomGate(committedZoom: number): ClusterZoomGate {
    return { committedZoom, pendingZoom: null, pendingAtMs: null };
}

export function nextCommittedClusterZoom(committedZoom: number, longitudeDelta: number): number {
    const zoom = zoomFromLongitudeDelta(longitudeDelta);
    if (!Number.isFinite(zoom)) return committedZoom;
    const next = Math.round(zoom);
    if (next === committedZoom) return committedZoom;
    if (Math.abs(next - committedZoom) === 1) {
        const midpoint = (committedZoom + next) / 2;
        if (Math.abs(zoom - midpoint) < CLUSTER_ZOOM_BUCKET_MARGIN) return committedZoom;
    }
    return next;
}

/** Record one camera sample. Intermediate buckets stay pending until the burst settles. */
export function noteClusterZoomSample(
    gate: ClusterZoomGate,
    longitudeDelta: number,
    nowMs: number,
): ClusterZoomGate {
    const pendingZoom = nextCommittedClusterZoom(gate.committedZoom, longitudeDelta);
    if (pendingZoom === gate.committedZoom) {
        return { committedZoom: gate.committedZoom, pendingZoom: null, pendingAtMs: null };
    }
    return { committedZoom: gate.committedZoom, pendingZoom, pendingAtMs: nowMs };
}

export function commitSettledClusterZoom(gate: ClusterZoomGate, nowMs: number): ClusterZoomGate {
    if (gate.pendingZoom == null || gate.pendingAtMs == null) return gate;
    if (nowMs - gate.pendingAtMs < CLUSTER_ZOOM_SETTLE_MS) return gate;
    return { committedZoom: gate.pendingZoom, pendingZoom: null, pendingAtMs: null };
}

export function longitudeDeltaForZoom(zoom: number): number {
    return 360 / 2 ** zoom;
}

export function clusterRadiusMeters(zoom: number, radiusPx = CLUSTER_RADIUS_PX): number {
    return (METERS_PER_PIXEL_AT_EQUATOR_ZOOM_0 / 2 ** zoom) * radiusPx;
}

export function filterOwnedMapMemories(memories: Memory[], filter: MapLibraryFilter | null): Memory[] {
    if (!filter) return memories.filter((memory) => !memory.deletedAt);
    if (filter.mode === 'custom') {
        return memories.filter((memory) =>
            !memory.deletedAt && (memory.customFolderIds ?? []).includes(filter.id)
        );
    }
    if (filter.mode === 'custom-multi') {
        return memories.filter((memory) =>
            !memory.deletedAt &&
            countryName(memory) === filter.country &&
            (memory.customFolderIds ?? []).some((folderId) => filter.ids.includes(folderId))
        );
    }
    return memories.filter((memory) =>
        !memory.deletedAt &&
        !memory.excludeFromCountryFolder &&
        countryName(memory) === filter.name
    );
}

export function filterSharedMapMemories(memories: Memory[], filter: MapLibraryFilter | null): Memory[] {
    if (!filter) return memories;
    if (filter.mode === 'custom') {
        return memories.filter((memory) => (memory.customFolderIds ?? []).includes(filter.id));
    }
    if (filter.mode === 'custom-multi') {
        return memories.filter((memory) =>
            !memory.deletedAt &&
            countryName(memory) === filter.country &&
            (memory.customFolderIds ?? []).some((folderId) => filter.ids.includes(folderId))
        );
    }
    return memories.filter((memory) =>
        !memory.excludeFromCountryFolder &&
        countryName(memory) === filter.name
    );
}

export function toMapMemoryPins(owned: Memory[], shared: Memory[]): MapMemoryPin[] {
    const ownedPins = owned
        .filter((memory) => isValidMapCoordinate(memory.latitude, memory.longitude))
        .map((memory) => ({ memory, variant: 'owned' as const }));
    const sharedPins = shared
        .filter((memory) => isValidMapCoordinate(memory.latitude, memory.longitude))
        .map((memory) => ({ memory, variant: 'shared' as const }));
    return [...ownedPins, ...sharedPins];
}

function countryName(memory: Pick<Memory, 'country'>): string {
    return memory.country || UNKNOWN_COUNTRY_FOLDER;
}
