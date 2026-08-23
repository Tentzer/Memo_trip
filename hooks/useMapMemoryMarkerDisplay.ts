import type { Memory } from '@/types/memory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'react-native';

const PREFETCH_CONCURRENCY = 6;
const REVEAL_CHUNK_SIZE = 25;
const REVEAL_CHUNK_DELAY_MS = 48;

export type MapMarkerListItem = {
    memory: Memory;
    variant: 'owned' | 'shared';
};

type Options = {
    /** Map surface finished loading (`onMapLoaded`). */
    mapReady: boolean;
    /** User wants memos visible (settings toggle + filter flows). */
    showMemories: boolean;
};

function markerFingerprint(items: MapMarkerListItem[]): string {
    return items.map(({ memory, variant }) => `${variant}:${memory.id}:${memory.uri}`).join('|');
}

async function prefetchImage(uri: string): Promise<boolean> {
    const trimmed = uri.trim();
    if (!trimmed) return false;
    try {
        await Image.prefetch(trimmed);
        return true;
    } catch {
        return false;
    }
}

/**
 * Prefetches memo photos and reveals map markers in small batches so Google
 * Maps never snapshots hundreds of custom Marker views at once (which causes
 * missing pins and wrong cached bitmaps).
 */
export function useMapMemoryMarkerDisplay(
    ownedMemories: Memory[],
    sharedMemories: Memory[],
    { mapReady, showMemories }: Options,
): MapMarkerListItem[] {
    const allItems = useMemo<MapMarkerListItem[]>(() => {
        const owned = ownedMemories.map((memory) => ({ memory, variant: 'owned' as const }));
        const shared = sharedMemories.map((memory) => ({ memory, variant: 'shared' as const }));
        return [...owned, ...shared];
    }, [ownedMemories, sharedMemories]);

    const fingerprint = useMemo(() => markerFingerprint(allItems), [allItems]);
    const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());
    const [revealCount, setRevealCount] = useState(0);
    const prefetchRunRef = useRef(0);

    const active = mapReady && showMemories;

    useEffect(() => {
        if (!active) {
            setReadyIds(new Set());
            setRevealCount(0);
            return;
        }

        const runId = ++prefetchRunRef.current;
        const idsForRun = new Set(allItems.map(({ memory }) => memory.id));
        const nextReady = new Set<string>();

        const markReady = (memoryId: string) => {
            if (prefetchRunRef.current !== runId) return;
            if (!idsForRun.has(memoryId)) return;
            nextReady.add(memoryId);
            setReadyIds(new Set(nextReady));
        };

        void (async () => {
            let index = 0;
            const workers = Array.from({ length: PREFETCH_CONCURRENCY }, async () => {
                while (index < allItems.length) {
                    if (prefetchRunRef.current !== runId) return;
                    const item = allItems[index++];
                    await prefetchImage(item.memory.uri);
                    markReady(item.memory.id);
                }
            });
            await Promise.all(workers);
        })();
    }, [active, fingerprint, allItems]);

    useEffect(() => {
        if (!active) return;

        const readyItems = allItems.filter(({ memory }) => readyIds.has(memory.id));
        if (readyItems.length === 0) {
            setRevealCount(0);
            return;
        }

        setRevealCount(Math.min(REVEAL_CHUNK_SIZE, readyItems.length));

        if (readyItems.length <= REVEAL_CHUNK_SIZE) return;

        let cancelled = false;
        let current = REVEAL_CHUNK_SIZE;
        const interval = setInterval(() => {
            if (cancelled) return;
            current = Math.min(current + REVEAL_CHUNK_SIZE, readyItems.length);
            setRevealCount(current);
            if (current >= readyItems.length) {
                clearInterval(interval);
            }
        }, REVEAL_CHUNK_DELAY_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [active, allItems, readyIds]);

    return useMemo(() => {
        if (!active) return [];
        const ready = allItems.filter(({ memory }) => readyIds.has(memory.id));
        return ready.slice(0, revealCount);
    }, [active, allItems, readyIds, revealCount]);
}
