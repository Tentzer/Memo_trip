import { useCallback, useEffect, useRef, useState } from 'react';

const SNAPSHOT_IDLE_MS = 700;

export type MarkerImagePhase = 'loading' | 'loaded' | 'error';

/**
 * Google Maps snapshots a custom marker on every frame while tracksViewChanges is true.
 * Capture the current photo once, then stop. A later viewRevision (count badge, ring)
 * takes one more snapshot without decoding the photo again.
 */
export function useMarkerImageSnapshot(
    imageUri: string,
    viewRevision = imageUri,
    trackWhileLoading = true,
): {
    tracksViewChanges: boolean;
    phase: MarkerImagePhase;
    onLoad: () => void;
    onError: () => void;
} {
    const [tracksViewChanges, setTracksViewChanges] = useState(trackWhileLoading);
    const [phase, setPhase] = useState<MarkerImagePhase>(imageUri ? 'loading' : 'error');
    const phaseRef = useRef(phase);
    const loadedUriRef = useRef<string | null>(null);
    const capturedUriRef = useRef<string | null>(null);
    const captureGenerationRef = useRef(0);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    phaseRef.current = phase;

    const clearIdleTimer = useCallback(() => {
        if (idleTimerRef.current == null) return;
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
    }, []);

    const stopTrackingAfterPaint = useCallback(() => {
        const generation = ++captureGenerationRef.current;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (captureGenerationRef.current !== generation) return;
                setTracksViewChanges(false);
            });
        });
    }, []);

    const keepTracking = useCallback(() => {
        captureGenerationRef.current += 1;
        setTracksViewChanges(true);
    }, []);

    const retakeSnapshot = useCallback(() => {
        setTracksViewChanges(true);
        stopTrackingAfterPaint();
    }, [stopTrackingAfterPaint]);

    useEffect(() => {
        clearIdleTimer();

        if (loadedUriRef.current === imageUri && imageUri.length > 0) {
            setPhase('loaded');
            retakeSnapshot();
            return clearIdleTimer;
        }

        capturedUriRef.current = null;
        const hasImage = imageUri.length > 0;
        setPhase(hasImage ? 'loading' : 'error');
        if (trackWhileLoading) {
            keepTracking();
        } else {
            captureGenerationRef.current += 1;
            setTracksViewChanges(false);
        }
        if (!hasImage) {
            retakeSnapshot();
            return clearIdleTimer;
        }

        idleTimerRef.current = setTimeout(() => {
            idleTimerRef.current = null;
            if (phaseRef.current !== 'loading') return;
            if (trackWhileLoading) {
                stopTrackingAfterPaint();
                return;
            }
            retakeSnapshot();
        }, SNAPSHOT_IDLE_MS);

        return clearIdleTimer;
    }, [clearIdleTimer, imageUri, keepTracking, retakeSnapshot, stopTrackingAfterPaint, trackWhileLoading]);

    const revisionRef = useRef(viewRevision);
    useEffect(() => {
        if (revisionRef.current === viewRevision) return;
        revisionRef.current = viewRevision;
        if (loadedUriRef.current !== imageUri || imageUri.length === 0) return;
        retakeSnapshot();
    }, [imageUri, retakeSnapshot, viewRevision]);

    const onLoad = useCallback(() => {
        if (capturedUriRef.current === imageUri) return;
        capturedUriRef.current = imageUri;
        loadedUriRef.current = imageUri;
        clearIdleTimer();
        setPhase('loaded');
        retakeSnapshot();
    }, [clearIdleTimer, imageUri, retakeSnapshot]);

    const onError = useCallback(() => {
        loadedUriRef.current = null;
        capturedUriRef.current = null;
        clearIdleTimer();
        setPhase('error');
        retakeSnapshot();
    }, [clearIdleTimer, retakeSnapshot]);

    return { tracksViewChanges, phase, onLoad, onError };
}
