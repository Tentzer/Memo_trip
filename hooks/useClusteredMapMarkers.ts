import { latitudeForMarkerViewportCenter } from '@/lib/mapCamera';
import {
    CLUSTER_ZOOM_SETTLE_MS,
    MAX_CLUSTER_ZOOM,
    clusterMapPins,
    commitSettledClusterZoom,
    createClusterZoomGate,
    longitudeDeltaForZoom,
    noteClusterZoomSample,
    toMapMemoryPins,
    zoomBucketFromLongitudeDelta,
    type MapMarkerItem,
    type MapPinCluster,
} from '@/lib/mapMemoryPins';
import { useMapMarkerReveal } from '@/hooks/useMapMarkerReveal';
import type { Memory } from '@/types/memory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

const INITIAL_LONGITUDE_DELTA = 0.01;

type MapRef = { current: MapView | null };

type UseClusteredMapMarkersArgs = {
    ownedMemories: Memory[];
    sharedMemories: Memory[];
    showMemoriesOnMap: boolean;
    isMemoriesMapLoading: boolean;
    revealMemoriesIncrementally: () => void;
    finishMemoriesMapLoad: () => void;
    mapRef: MapRef;
    insetsTop: number;
    tabBarHeight: number;
};

export function useClusteredMapMarkers({
    ownedMemories,
    sharedMemories,
    showMemoriesOnMap,
    isMemoriesMapLoading,
    revealMemoriesIncrementally,
    finishMemoriesMapLoad,
    mapRef,
    insetsTop,
    tabBarHeight,
}: UseClusteredMapMarkersArgs): {
    markerItemsToRender: MapMarkerItem[];
    handleRegionChangeComplete: (region: Region) => void;
    handleClusterPress: (cluster: MapPinCluster) => void;
} {
    const mapRegionRef = useRef<Region>({
        latitude: 0,
        longitude: 0,
        latitudeDelta: INITIAL_LONGITUDE_DELTA,
        longitudeDelta: INITIAL_LONGITUDE_DELTA,
    });
    const initialZoom = zoomBucketFromLongitudeDelta(INITIAL_LONGITUDE_DELTA);
    const [clusterZoom, setClusterZoom] = useState(initialZoom);
    const zoomGateRef = useRef(createClusterZoomGate(initialZoom));
    const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSettleTimer = useCallback(() => {
        if (settleTimerRef.current == null) return;
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
    }, []);

    useEffect(() => clearSettleTimer, [clearSettleTimer]);

    const mapMemoryPins = useMemo(
        () => toMapMemoryPins(ownedMemories, sharedMemories),
        [ownedMemories, sharedMemories],
    );
    const clusteredMarkers = useMemo(
        () => clusterMapPins(mapMemoryPins, clusterZoom),
        [mapMemoryPins, clusterZoom],
    );
    const revealCount = useMapMarkerReveal(
        clusteredMarkers,
        showMemoriesOnMap,
        isMemoriesMapLoading,
        revealMemoriesIncrementally,
        finishMemoriesMapLoad,
    );
    const markerItemsToRender = useMemo(() => {
        if (!showMemoriesOnMap) return [];
        if (!isMemoriesMapLoading) return clusteredMarkers;
        return clusteredMarkers.slice(0, revealCount);
    }, [showMemoriesOnMap, isMemoriesMapLoading, clusteredMarkers, revealCount]);

    const handleRegionChangeComplete = useCallback((region: Region) => {
        mapRegionRef.current = region;
        const nowMs = Date.now();
        const gate = noteClusterZoomSample(zoomGateRef.current, region.longitudeDelta, nowMs);
        zoomGateRef.current = gate;
        clearSettleTimer();
        if (gate.pendingZoom == null || gate.pendingAtMs == null) return;

        const pendingAtMs = gate.pendingAtMs;
        settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            const current = zoomGateRef.current;
            if (current.pendingAtMs !== pendingAtMs) return;
            const settled = commitSettledClusterZoom(current, pendingAtMs + CLUSTER_ZOOM_SETTLE_MS);
            zoomGateRef.current = settled;
            setClusterZoom((zoom) => (zoom === settled.committedZoom ? zoom : settled.committedZoom));
        }, CLUSTER_ZOOM_SETTLE_MS);
    }, [clearSettleTimer]);

    const handleClusterPress = useCallback((cluster: MapPinCluster) => {
        const coordinates = cluster.members.map((member) => ({
            latitude: member.memory.latitude,
            longitude: member.memory.longitude,
        }));
        if (coordinates.length === 0) return;

        const fitDelta = longitudeDeltaForZoom(MAX_CLUSTER_ZOOM);
        const latitudes = coordinates.map((coordinate) => coordinate.latitude);
        const longitudes = coordinates.map((coordinate) => coordinate.longitude);
        const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
        const lngSpan = Math.max(...longitudes) - Math.min(...longitudes);
        const currentZoom = zoomBucketFromLongitudeDelta(mapRegionRef.current.longitudeDelta);
        const showMembers = currentZoom >= MAX_CLUSTER_ZOOM || (latSpan <= fitDelta && lngSpan <= fitDelta);

        if (showMembers) {
            mapRef.current?.animateToRegion({
                latitude: latitudeForMarkerViewportCenter(cluster.latitude, fitDelta),
                longitude: cluster.longitude,
                latitudeDelta: fitDelta,
                longitudeDelta: fitDelta,
            }, 500);
            return;
        }

        mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: {
                top: insetsTop + 96,
                right: 56,
                bottom: tabBarHeight + 96,
                left: 56,
            },
            animated: true,
        });
    }, [insetsTop, mapRef, tabBarHeight]);

    return { markerItemsToRender, handleRegionChangeComplete, handleClusterPress };
}
