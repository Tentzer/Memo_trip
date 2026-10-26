import { useEffect, useRef, useState } from 'react';

const MAP_MEMORIES_CHUNK_SIZE = 35;

/** Mounts a large marker set in slices so the first map paint is not one giant snapshot. */
export function useMapMarkerReveal(
    items: readonly unknown[],
    showOnMap: boolean,
    isLoading: boolean,
    startLoading: () => void,
    finishLoading: () => void,
): number {
    const [revealCount, setRevealCount] = useState(0);
    const loadRunRef = useRef(0);
    const bulkLoadStartedRef = useRef(false);

    useEffect(() => {
        if (items.length === 0) {
            bulkLoadStartedRef.current = false;
            return;
        }
        if (bulkLoadStartedRef.current) return;
        if (items.length <= MAP_MEMORIES_CHUNK_SIZE) return;
        if (isLoading) {
            bulkLoadStartedRef.current = true;
            return;
        }
        bulkLoadStartedRef.current = true;
        startLoading();
    }, [items, isLoading, startLoading]);

    useEffect(() => {
        if (!showOnMap || !isLoading) return;

        const runId = ++loadRunRef.current;
        const total = items.length;

        if (total === 0) {
            finishLoading();
            return;
        }

        let revealed = 0;
        setRevealCount(0);

        const step = () => {
            if (loadRunRef.current !== runId) return;

            revealed = Math.min(revealed + MAP_MEMORIES_CHUNK_SIZE, total);
            setRevealCount(revealed);

            if (revealed >= total) {
                finishLoading();
                return;
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(step);
            });
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(step);
        });

        return () => {
            loadRunRef.current += 1;
        };
    }, [showOnMap, isLoading, items, finishLoading]);

    return revealCount;
}
