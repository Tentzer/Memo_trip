import { latitudeForMarkerViewportCenter } from '@/lib/mapCamera';
import {
    createMapClusterIndex,
    queryMapClusters,
} from '@/lib/mapClusterIndex';
import {
    CLUSTER_ZOOM_SETTLE_MS,
    commitSettledClusterZoom,
    createClusterZoomGate,
    longitudeDeltaForZoom,
    noteClusterZoomSample,
    pinImageUri,
    toMapMemoryPins,
    zoomBucketFromLongitudeDelta,
    zoomFromLongitudeDelta,
    type MapMarkerItem,
    type MapPinCluster,
} from '@/lib/mapMemoryPins';
import {
    MARKER_MOUNT_BATCH,
    MARKER_REGION_PADDING,
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
};

export function useClusteredMapMarkers({
    ownedMemories,
    sharedMemories,
    showMemoriesOnMap,
    isMemoriesMapLoading,
    revealMemoriesIncrementally,
    finishMemoriesMapLoad,
    mapRef,
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
    const clusterIndex = useMemo(
        () => createMapClusterIndex(mapMemoryPins),
        [mapMemoryPins],
    );
    const clusteredMarkers = useMemo(() => {
        if (!markerRegion) return [];
        return queryMapClusters(clusterIndex, markerRegion, clusterZoom, MARKER_REGION_PADDING);
    }, [clusterIndex, markerRegion, clusterZoom]);
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
        const currentZoom = zoomFromLongitudeDelta(mapRegionRef.current.longitudeDelta);
        let targetZoom = cluster.expansionZoom;
        if (!Number.isFinite(targetZoom)) targetZoom = currentZoom + 1;
        if (targetZoom <= currentZoom) targetZoom = Math.floor(currentZoom) + 1;
        targetZoom = Math.min(20, targetZoom);
        const longitudeDelta = longitudeDeltaForZoom(targetZoom);
        mapRef.current?.animateToRegion({
            latitude: latitudeForMarkerViewportCenter(cluster.latitude, longitudeDelta),
            longitude: cluster.longitude,
            latitudeDelta: longitudeDelta,
            longitudeDelta,
        }, 500);
    }, [mapRef]);

    return { markerItemsToRender, handleRegionChangeComplete, handleClusterPress };
}
