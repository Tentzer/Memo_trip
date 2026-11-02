import { cachedMarkerCoordinate } from '@/lib/markerPinProps';
import { pinImageUri, type MapPinCluster } from '@/lib/mapMemoryPins';
import { categoryBadgeForMapMarker } from '@/lib/markerCategoryBadge';
import { PIN_BITMAP_POINT_HEIGHT, PIN_BITMAP_POINT_WIDTH } from '@/lib/pinBitmapCapture';
import { bitmapUriForMarker, peekPinBitmap } from '@/lib/pinBitmapCache';
import {
    bitmapKeyForSpec,
    type BitmapSpec,
    type ClusterBitmapInput,
    type PinBitmapInput,
} from '@/lib/pinBitmapKey';
import { requestPinBitmap } from '@/lib/pinBitmapQueue';
import type { Memory } from '@/types/memory';
import React, { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-native-maps';

const MARKER_ANCHOR = { x: 0.5, y: 1 };
const MARKER_LAYOUT = { width: PIN_BITMAP_POINT_WIDTH, height: PIN_BITMAP_POINT_HEIGHT };

type MapMemoryMarkerProps = {
    memory: Memory;
    variant: 'owned' | 'shared';
    onMarkerPress: (memory: Memory) => void;
};

type MapClusterMarkerProps = {
    cluster: MapPinCluster;
    onPress: (cluster: MapPinCluster) => void;
};

function useBitmapUri(spec: BitmapSpec): string {
    const key = bitmapKeyForSpec(spec);
    const specRef = useRef(spec);
    specRef.current = spec;
    const [uri, setUri] = useState(() => bitmapUriForMarker(key));
    useEffect(() => {
        const cached = peekPinBitmap(key);
        if (cached) {
            setUri(cached);
            return undefined;
        }
        let cancelled = false;
        void requestPinBitmap(specRef.current).then((next) => {
            if (!cancelled) setUri(next);
        });
        return () => {
            cancelled = true;
        };
    }, [key]);
    return uri;
}

function pinSpec(memory: Memory, variant: 'owned' | 'shared'): PinBitmapInput & { kind: 'pin' } {
    return {
        kind: 'pin',
        memoryId: memory.id,
        imageUri: pinImageUri(memory),
        badge: categoryBadgeForMapMarker({ type: 'pin', placeCategory: memory.placeCategory }),
        variant,
        selected: false,
        video: memory.source === 'video_import',
    };
}

function clusterSpec(cluster: MapPinCluster): ClusterBitmapInput & { kind: 'cluster' } {
    const mixed = cluster.hasOwned && cluster.hasShared;
    const frame = !mixed && cluster.hasShared ? 'shared' : 'owned';
    return {
        kind: 'cluster',
        count: cluster.count,
        imageUri: pinImageUri(cluster.newest.memory),
        frame,
        ring: mixed ? 'mixed' : frame,
        variant: cluster.newest.variant,
    };
}

function MapMemoryMarkerComponent({ memory, variant, onMarkerPress }: MapMemoryMarkerProps) {
    const uri = useBitmapUri(pinSpec(memory, variant));
    const coordinate = cachedMarkerCoordinate(memory.id, memory.latitude, memory.longitude);
    return (
        <Marker
            identifier={memory.id}
            coordinate={coordinate}
            image={{ uri }}
            anchor={MARKER_ANCHOR}
            tracksViewChanges={false}
            style={MARKER_LAYOUT}
            zIndex={999}
            onPress={(event) => {
                event.stopPropagation?.();
                onMarkerPress(memory);
            }}
        />
    );
}

function sameMemoryMarker(prev: MapMemoryMarkerProps, next: MapMemoryMarkerProps): boolean {
    return prev.variant === next.variant
        && prev.onMarkerPress === next.onMarkerPress
        && prev.memory.id === next.memory.id
        && prev.memory.uri === next.memory.uri
        && prev.memory.thumb_uri === next.memory.thumb_uri
        && prev.memory.latitude === next.memory.latitude
        && prev.memory.longitude === next.memory.longitude
        && prev.memory.source === next.memory.source
        && prev.memory.placeCategory === next.memory.placeCategory;
}

export const MapMemoryMarker = React.memo(MapMemoryMarkerComponent, sameMemoryMarker);

function MapClusterMarkerComponent({ cluster, onPress }: MapClusterMarkerProps) {
    const uri = useBitmapUri(clusterSpec(cluster));
    const coordinate = cachedMarkerCoordinate(cluster.id, cluster.latitude, cluster.longitude);
    return (
        <Marker
            identifier={cluster.id}
            coordinate={coordinate}
            image={{ uri }}
            anchor={MARKER_ANCHOR}
            tracksViewChanges={false}
            style={MARKER_LAYOUT}
            zIndex={1000}
            onPress={(event) => {
                event.stopPropagation?.();
                onPress(cluster);
            }}
        />
    );
}

function sameCluster(prev: MapClusterMarkerProps, next: MapClusterMarkerProps): boolean {
    return prev.onPress === next.onPress
        && prev.cluster.id === next.cluster.id
        && prev.cluster.count === next.cluster.count
        && prev.cluster.latitude === next.cluster.latitude
        && prev.cluster.longitude === next.cluster.longitude
        && prev.cluster.hasOwned === next.cluster.hasOwned
        && prev.cluster.hasShared === next.cluster.hasShared
        && prev.cluster.newest.variant === next.cluster.newest.variant
        && prev.cluster.newest.memory.id === next.cluster.newest.memory.id
        && prev.cluster.newest.memory.uri === next.cluster.newest.memory.uri
        && prev.cluster.newest.memory.thumb_uri === next.cluster.newest.memory.thumb_uri;
}

export const MapClusterMarker = React.memo(MapClusterMarkerComponent, sameCluster);
