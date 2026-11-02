import { useCallback, useEffect, useRef, useState } from 'react';

const SNAPSHOT_IDLE_MS = 700;

export type MarkerImagePhase = 'loading' | 'loaded' | 'error';

/**
 * Google Maps snapshots a custom marker while tracksViewChanges is true.
 * Track only for the current image, then stop so pan/zoom does not resnapshot every pin.
 */
export function useMarkerImageSnapshot(imageUri: string): {
    tracksViewChanges: boolean;
    phase: MarkerImagePhase;
    onLoad: () => void;
    onError: () => void;
} {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const [phase, setPhase] = useState<MarkerImagePhase>(imageUri ? 'loading' : 'error');
    const phaseRef = useRef(phase);
    const loadedUriRef = useRef<string | null>(null);
    phaseRef.current = phase;

    const stopTrackingAfterPaint = useCallback(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setTracksViewChanges(false));
        });
    }, []);

    useEffect(() => {
        if (loadedUriRef.current === imageUri && imageUri.length > 0) {
            setPhase('loaded');
            stopTrackingAfterPaint();
            return;
        }

        const hasImage = imageUri.length > 0;
        setPhase(hasImage ? 'loading' : 'error');
        setTracksViewChanges(true);
        if (!hasImage) {
            stopTrackingAfterPaint();
            return;
        }

        const timeout = setTimeout(() => {
            if (phaseRef.current === 'loading') {
                setTracksViewChanges(false);
            }
        }, SNAPSHOT_IDLE_MS);

        return () => clearTimeout(timeout);
    }, [imageUri, stopTrackingAfterPaint]);

    const onLoad = useCallback(() => {
        loadedUriRef.current = imageUri;
        setPhase('loaded');
        setTracksViewChanges(true);
        stopTrackingAfterPaint();
    }, [imageUri, stopTrackingAfterPaint]);

    const onError = useCallback(() => {
        loadedUriRef.current = null;
        setPhase('error');
        setTracksViewChanges(true);
        stopTrackingAfterPaint();
    }, [stopTrackingAfterPaint]);

    return { tracksViewChanges, phase, onLoad, onError };
}
