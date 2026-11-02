import { ensureMarkerIconFonts, markerIconFontsReady } from '@/lib/markerIconFonts';
import {
    MARKER_PAINT_WINDOW_MS,
    markerSnapshotScheduler,
    type MarkerSnapshotRelease,
} from '@/lib/markerSnapshotScheduler';
import { useCallback, useEffect, useRef, useState } from 'react';

export type MarkerImagePhase = 'loading' | 'loaded' | 'error';

/**
 * Google Maps freezes a custom marker's bitmap when tracksViewChanges turns off.
 * Track only after the photo is in the React tree, and only for a few markers at a time,
 * long enough for the native snapshot to include the pixels.
 */
export function useMarkerImageSnapshot(
    imageUri: string,
    viewRevision = imageUri,
    waitForIconFont = false,
): {
    tracksViewChanges: boolean;
    phase: MarkerImagePhase;
    onLoad: () => void;
    onError: () => void;
} {
    const [tracksViewChanges, setTracksViewChanges] = useState(false);
    const [trackedUri, setTrackedUri] = useState(imageUri);
    const [phase, setPhase] = useState<MarkerImagePhase>(imageUri ? 'loading' : 'error');
    const mountedRef = useRef(true);
    const releaseRef = useRef<MarkerSnapshotRelease | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    if (trackedUri !== imageUri) {
        setTrackedUri(imageUri);
        setPhase(imageUri ? 'loading' : 'error');
        setTracksViewChanges(false);
    }

    const clearWindow = useCallback(() => {
        if (timerRef.current != null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        releaseRef.current?.();
        releaseRef.current = null;
    }, []);

    useEffect(() => {
        if (phase === 'loading') return undefined;
        let cancelled = false;

        const fontsReadyAtStart = !waitForIconFont || markerIconFontsReady();
        void (async () => {
            if (waitForIconFont) await ensureMarkerIconFonts();
            if (cancelled || !mountedRef.current) return;
            if (!fontsReadyAtStart) {
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                });
            }
            if (cancelled || !mountedRef.current) return;
            const release = await markerSnapshotScheduler.acquire();
            if (cancelled || !mountedRef.current) {
                release();
                return;
            }
            releaseRef.current = release;
            setTracksViewChanges(true);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                if (mountedRef.current) setTracksViewChanges(false);
                release();
                if (releaseRef.current === release) releaseRef.current = null;
            }, MARKER_PAINT_WINDOW_MS);
        })();

        return () => {
            cancelled = true;
            clearWindow();
            if (mountedRef.current) setTracksViewChanges(false);
        };
    }, [clearWindow, imageUri, phase, viewRevision, waitForIconFont]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const onLoad = useCallback(() => {
        setPhase('loaded');
    }, []);

    const onError = useCallback(() => {
        setPhase('error');
    }, []);

    return { tracksViewChanges, phase, onLoad, onError };
}
