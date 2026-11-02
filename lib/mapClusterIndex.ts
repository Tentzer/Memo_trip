import {
    CLUSTER_RADIUS_PX,
    MAX_CLUSTER_ZOOM,
    type MapMarkerItem,
    type MapMemoryPin,
    type MapPinCluster,
} from '@/lib/mapMemoryPins';
import Supercluster, { type ClusterFeature, type PointFeature } from 'supercluster';

/**
 * Google Maps tiles are 256px. Supercluster's default extent is 512, which would
 * make the same radius cover half as many screen pixels.
 */
const CLUSTER_TILE_EXTENT_PX = 256;
/** maxZoom is the last zoom that still produces clusters, so zoom 14+ stays individual pins. */
const CLUSTER_INDEX_MAX_ZOOM = MAX_CLUSTER_ZOOM - 1;
const WORLD_BBOX: [number, number, number, number] = [-180, -85, 180, 85];

type PinPointProps = { pinIndex: number };
type ClusterBBox = [number, number, number, number];
type IndexedFeature = ClusterFeature<Record<string, never>> | PointFeature<PinPointProps>;

export type MapClusterQueryRegion = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};

export type MapClusterIndex = {
    query(bbox: ClusterBBox, zoom: number): MapMarkerItem[];
};

/**
 * Builds the supercluster index once for a pin set. Sort by id so cluster ids
 * do not depend on the order memories arrived in.
 */
export function createMapClusterIndex(pins: readonly MapMemoryPin[]): MapClusterIndex {
    const ordered = [...pins].sort((a, b) => a.memory.id.localeCompare(b.memory.id));
    const index = new Supercluster<PinPointProps, Record<string, never>>({
        radius: CLUSTER_RADIUS_PX,
        extent: CLUSTER_TILE_EXTENT_PX,
        maxZoom: CLUSTER_INDEX_MAX_ZOOM,
        minPoints: 2,
    });
    index.load(ordered.map((pin, pinIndex) => ({
        type: 'Feature',
        properties: { pinIndex },
        geometry: {
            type: 'Point',
            coordinates: [pin.memory.longitude, pin.memory.latitude],
        },
    })));

    return {
        query(bbox, zoom) {
            const items: MapMarkerItem[] = [];
            for (const feature of index.getClusters(bbox, zoom)) {
                if (isClusterFeature(feature)) {
                    const cluster = clusterFromFeature(
                        index,
                        ordered,
                        feature.properties.cluster_id,
                        feature.properties.point_count,
                        feature.geometry.coordinates,
                    );
                    if (cluster) items.push({ type: 'cluster', cluster });
                    continue;
                }
                const pin = ordered[feature.properties.pinIndex];
                if (pin) items.push({ type: 'pin', pin });
            }
            return items;
        },
    };
}

/** Clusters and pins inside one camera region. Padding matches the marker viewport. */
export function queryMapClusters(
    index: MapClusterIndex,
    region: MapClusterQueryRegion,
    zoom: number,
    padding = 0,
): MapMarkerItem[] {
    return index.query(bboxForRegion(region, padding), zoom);
}

/**
 * Groups nearby pins for one zoom. Builds an index for this call.
 * Prefer {@link createMapClusterIndex} when the same pins are queried again.
 * Zoom at or above {@link MAX_CLUSTER_ZOOM} returns every pin on its own.
 */
export function clusterMapPins(pins: MapMemoryPin[], zoom: number): MapMarkerItem[] {
    if (pins.length === 0) return [];
    return createMapClusterIndex(pins).query(WORLD_BBOX, zoom);
}

function isClusterFeature(feature: IndexedFeature): feature is ClusterFeature<Record<string, never>> {
    const props = feature.properties;
    return props != null && 'cluster' in props && props.cluster === true;
}

function bboxForRegion(region: MapClusterQueryRegion, padding: number): ClusterBBox {
    const latSpan = Math.abs(region.latitudeDelta) * (0.5 + padding);
    const lngSpan = Math.abs(region.longitudeDelta) * (0.5 + padding);
    const south = Math.max(-85, region.latitude - latSpan);
    const north = Math.min(85, region.latitude + latSpan);
    return [region.longitude - lngSpan, south, region.longitude + lngSpan, north];
}

function clusterFromFeature(
    index: Supercluster<PinPointProps, Record<string, never>>,
    pins: readonly MapMemoryPin[],
    clusterId: number,
    pointCount: number,
    coordinates: number[],
): MapPinCluster | null {
    const members = index.getLeaves(clusterId, Math.max(pointCount, 1))
        .map((leaf) => pins[leaf.properties.pinIndex])
        .filter((pin): pin is MapMemoryPin => pin != null)
        .sort((a, b) => a.memory.id.localeCompare(b.memory.id));
    const newest = members.reduce<MapMemoryPin | null>((current, member) => {
        if (!current || isNewerMemory(member.memory, current.memory)) return member;
        return current;
    }, null);
    if (!newest) return null;
    return {
        id: `cluster:${clusterId}`,
        latitude: coordinates[1] ?? newest.memory.latitude,
        longitude: coordinates[0] ?? newest.memory.longitude,
        count: pointCount,
        newest,
        hasOwned: members.some((member) => member.variant === 'owned'),
        hasShared: members.some((member) => member.variant === 'shared'),
        members,
        expansionZoom: index.getClusterExpansionZoom(clusterId),
    };
}

function isNewerMemory(
    candidate: MapMemoryPin['memory'],
    current: MapMemoryPin['memory'],
): boolean {
    const candidateTime = recency(candidate.created_at);
    const currentTime = recency(current.created_at);
    if (candidateTime !== currentTime) return candidateTime > currentTime;
    return candidate.id > current.id;
}

function recency(createdAt: string): number {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
}
