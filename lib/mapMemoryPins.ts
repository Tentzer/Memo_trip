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
};

export type MapMarkerItem =
    | { type: 'pin'; pin: MapMemoryPin }
    | { type: 'cluster'; cluster: MapPinCluster };

/** At this zoom and closer, grouped memories render as individual pins. */
export const MAX_CLUSTER_ZOOM = 16;
export const CLUSTER_RADIUS_PX = 56;

const METERS_PER_PIXEL_AT_EQUATOR_ZOOM_0 = 156543.03392;
const METERS_PER_LATITUDE_DEGREE = 111_320;

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

/**
 * Groups nearby pins for one zoom bucket. Call again when the bucket or the pin set changes.
 * Zoom at or above {@link MAX_CLUSTER_ZOOM} returns every pin on its own.
 */
export function clusterMapPins(pins: MapMemoryPin[], zoom: number): MapMarkerItem[] {
    if (pins.length === 0) return [];
    if (zoom >= MAX_CLUSTER_ZOOM) {
        return pins.map((pin) => ({ type: 'pin', pin }));
    }

    const radiusMeters = clusterRadiusMeters(zoom);
    const ordered = pins.map((pin, index) => ({ pin, index }));
    ordered.sort((a, b) => a.pin.memory.id.localeCompare(b.pin.memory.id));
    const used = new Array<boolean>(pins.length).fill(false);
    const items: MapMarkerItem[] = [];

    for (const entry of ordered) {
        if (used[entry.index]) continue;
        used[entry.index] = true;
        const group: MapMemoryPin[] = [entry.pin];
        for (const other of ordered) {
            if (used[other.index]) continue;
            if (distanceMeters(entry.pin.memory, other.pin.memory) <= radiusMeters) {
                used[other.index] = true;
                group.push(other.pin);
            }
        }
        items.push(group.length >= 2
            ? { type: 'cluster', cluster: buildCluster(group) }
            : { type: 'pin', pin: entry.pin });
    }

    return items;
}

function countryName(memory: Pick<Memory, 'country'>): string {
    return memory.country || UNKNOWN_COUNTRY_FOLDER;
}

function distanceMeters(
    a: Pick<Memory, 'latitude' | 'longitude'>,
    b: Pick<Memory, 'latitude' | 'longitude'>,
): number {
    const latitudeRad = ((a.latitude + b.latitude) / 2) * Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * METERS_PER_LATITUDE_DEGREE;
    const dLng = (b.longitude - a.longitude) * METERS_PER_LATITUDE_DEGREE * Math.cos(latitudeRad);
    return Math.hypot(dLat, dLng);
}

function recency(memory: Memory): number {
    const parsed = Date.parse(memory.created_at);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isNewerMemory(candidate: Memory, current: Memory): boolean {
    const candidateTime = recency(candidate);
    const currentTime = recency(current);
    if (candidateTime !== currentTime) return candidateTime > currentTime;
    return candidate.id > current.id;
}

function buildCluster(members: MapMemoryPin[]): MapPinCluster {
    const ordered = [...members].sort((a, b) => a.memory.id.localeCompare(b.memory.id));
    let latitude = 0;
    let longitude = 0;
    let hasOwned = false;
    let hasShared = false;
    let newest = ordered[0];
    for (const member of ordered) {
        latitude += member.memory.latitude;
        longitude += member.memory.longitude;
        if (member.variant === 'owned') hasOwned = true;
        if (member.variant === 'shared') hasShared = true;
        if (isNewerMemory(member.memory, newest.memory)) newest = member;
    }
    const count = ordered.length;
    return {
        id: `cluster:${ordered.map((member) => member.memory.id).join(':')}`,
        latitude: latitude / count,
        longitude: longitude / count,
        count,
        newest,
        hasOwned,
        hasShared,
        members: ordered,
    };
}
