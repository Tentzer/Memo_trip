import { latitudeForMarkerViewportCenter } from '@/lib/mapCamera';
import {
    createMapClusterIndex,
    previewMapMarkers,
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
    markerItemKey,
    planMountedMarkers,
    regionForMarkerQuery,
    sameMarkerList,
} from '@/lib/visibleMapMarkers';
import { useMapMarkerReveal } from '@/hooks/useMapMarkerReveal';
import { setPinBitmapCapturePaused } from '@/lib/pinBitmapQueue';
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
    handleRegionChange: () => void;
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
    const gestureActiveRef = useRef(false);
    const clusterIndexRef = useRef<ReturnType<typeof createMapClusterIndex> | null>(null);
    const committedZoomRef = useRef(initialZoom);
    const queryRegionRef = useRef<Region | null>(null);
    const [markerRegion, setMarkerRegion] = useState<Region | null>(null);
    const visibleRef = useRef<MapMarkerItem[]>([]);
    const mountedRef = useRef<MapMarkerItem[]>([]);
    const mountedKeysRef = useRef<ReadonlySet<string>>(new Set());
    const [mountedItems, setMountedItems] = useState<MapMarkerItem[]>([]);

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
    clusterIndexRef.current = clusterIndex;
    const visibleMarkers = useMemo(() => {
        if (!markerRegion) return [];
        const preview = previewMapMarkers(
            clusterIndex,
            markerRegion,
            clusterZoom,
            visibleRef.current,
            mountedKeysRef.current,
        );
        visibleRef.current = preview;
        return preview;
    }, [clusterIndex, markerRegion, clusterZoom]);
    mountedKeysRef.current = new Set(visibleMarkers.map((item) => markerItemKey(item)));
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
        // Add and remove only the markers whose keys changed. Clearing the list
        // on zoom remounts every pin and the snapshot paints the placeholder again.
        let cancelled = false;
        const desired = revealedMarkers;
        const publish = (from: readonly MapMarkerItem[]) => {
            const next = planMountedMarkers(from, desired);
            if (sameMarkerList(from, next)) return from;
            mountedRef.current = next;
            setMountedItems(next);
            return next;
        };
        let current = publish(mountedRef.current);
        if (current.length >= desired.length) return undefined;

        const step = () => {
            if (cancelled) return;
            current = publish(current);
            if (current.length < desired.length) {
                frame = requestAnimationFrame(step);
            }
        };
        let frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
        };
    }, [revealedMarkers]);

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
            if (cancelled || gestureActiveRef.current) return;
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
        if (!gestureActiveRef.current) pump();
        return () => {
            cancelled = true;
        };
    }, [visibleMarkers]);

    const markerItemsToRender = mountedItems;

    const handleRegionChange = useCallback(() => {
        gestureActiveRef.current = true;
        setPinBitmapCapturePaused(true);
    }, []);

    const handleRegionChangeComplete = useCallback((region: Region) => {
        gestureActiveRef.current = false;
        setPinBitmapCapturePaused(false);
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
                committedZoomRef.current = settled.committedZoom;
            }
            const index = clusterIndexRef.current;
            if (!index) return;
            const queryRegion = regionForMarkerQuery(queryRegionRef.current, mapRegionRef.current);
            const preview = previewMapMarkers(
                index,
                queryRegion,
                committedZoomRef.current,
                visibleRef.current,
                mountedKeysRef.current,
            );
            queryRegionRef.current = queryRegion;
            if (preview === visibleRef.current) return;
            setClusterZoom(committedZoomRef.current);
            setMarkerRegion(queryRegion);
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

    return { markerItemsToRender, handleRegionChange, handleRegionChangeComplete, handleClusterPress };
}
