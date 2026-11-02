import { latitudeForMarkerViewportCenter } from '@/lib/mapCamera';
import {
    CLUSTER_ZOOM_SETTLE_MS,
    MAX_CLUSTER_ZOOM,
    clusterMapPins,
    commitSettledClusterZoom,
    createClusterZoomGate,
    longitudeDeltaForZoom,
    noteClusterZoomSample,
    pinImageUri,
    toMapMemoryPins,
    zoomBucketFromLongitudeDelta,
    type MapMarkerItem,
    type MapPinCluster,
} from '@/lib/mapMemoryPins';
import {
    MARKER_MOUNT_BATCH,
    nextMarkerMountCount,
    selectVisibleMarkers,
    shouldRefreshMarkerRegion,
} from '@/lib/visibleMapMarkers';
import { useMapMarkerReveal } from '@/hooks/useMapMarkerReveal';
import type { Memory } from '@/types/memory';
import { Image } from 'expo-image';
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
    const settleTokenRef = useRef(0);
    const mountZoomRef = useRef(initialZoom);
    const shownCountRef = useRef(0);
    const [markerRegion, setMarkerRegion] = useState<Region | null>(null);
    const [mountCount, setMountCount] = useState(0);

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
    const visibleMarkers = useMemo(
        () => selectVisibleMarkers(clusteredMarkers, markerRegion),
        [clusteredMarkers, markerRegion],
    );
    const revealCount = useMapMarkerReveal(
        visibleMarkers,
        showMemoriesOnMap,
        isMemoriesMapLoading,
        revealMemoriesIncrementally,
        finishMemoriesMapLoad,
    );
    const revealedMarkers = useMemo(() => {
        if (!showMemoriesOnMap) return [];
        if (!isMemoriesMapLoading) return visibleMarkers;
        return visibleMarkers.slice(0, revealCount);
    }, [showMemoriesOnMap, isMemoriesMapLoading, visibleMarkers, revealCount]);

    useEffect(() => {
        const zoomChanged = mountZoomRef.current !== clusterZoom;
        mountZoomRef.current = clusterZoom;
        const total = revealedMarkers.length;
        const replaceGeneration = zoomChanged
            && (shownCountRef.current > MARKER_MOUNT_BATCH || total > MARKER_MOUNT_BATCH);
        let cancelled = false;
        let shown = replaceGeneration ? 0 : total;
        shownCountRef.current = shown;
        setMountCount(shown);

        if (shown >= total) return undefined;

        const step = () => {
            if (cancelled) return;
            shown = nextMarkerMountCount(shown, total);
            shownCountRef.current = shown;
            setMountCount(shown);
            if (shown < total) requestAnimationFrame(step);
        };
        const frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [clusterZoom, revealedMarkers]);

    useEffect(() => {
        let cancelled = false;
        const uris: string[] = [];
        const seen = new Set<string>();
        for (const item of visibleMarkers) {
            const memory = item.type === 'pin' ? item.pin.memory : item.cluster.newest.memory;
            const uri = pinImageUri(memory);
            if (!uri || seen.has(uri)) continue;
            seen.add(uri);
            uris.push(uri);
        }
        let index = 0;
        let running = 0;
        const pump = () => {
            if (cancelled) return;
            while (running < 2 && index < uris.length) {
                const uri = uris[index];
                index += 1;
                running += 1;
                void Image.prefetch(uri, 'disk').catch(() => undefined).finally(() => {
                    running -= 1;
                    pump();
                });
            }
        };
        pump();
        return () => {
            cancelled = true;
        };
    }, [visibleMarkers]);

    const markerItemsToRender = useMemo(
        () => revealedMarkers.slice(0, mountCount),
        [revealedMarkers, mountCount],
    );

    const handleRegionChangeComplete = useCallback((region: Region) => {
        mapRegionRef.current = region;
        const nowMs = Date.now();
        const gate = noteClusterZoomSample(zoomGateRef.current, region.longitudeDelta, nowMs);
        zoomGateRef.current = gate;
        clearSettleTimer();
        const token = ++settleTokenRef.current;
        const pendingAtMs = gate.pendingAtMs;
        settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            if (settleTokenRef.current !== token) return;
            if (pendingAtMs != null && zoomGateRef.current.pendingAtMs === pendingAtMs) {
                const settled = commitSettledClusterZoom(
                    zoomGateRef.current,
                    pendingAtMs + CLUSTER_ZOOM_SETTLE_MS,
                );
                zoomGateRef.current = settled;
                setClusterZoom((zoom) => (zoom === settled.committedZoom ? zoom : settled.committedZoom));
            }
            const nextRegion = mapRegionRef.current;
            setMarkerRegion((current) => (
                shouldRefreshMarkerRegion(current, nextRegion) ? nextRegion : current
            ));
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
