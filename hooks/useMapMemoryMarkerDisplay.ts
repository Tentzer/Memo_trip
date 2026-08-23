import type { Memory } from '@/types/memory';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'react-native';

const PREFETCH_CONCURRENCY = 6;
const REVEAL_FLUSH_INTERVAL_MS = 48;

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

async function prefetchImage(uri: string): Promise<void> {
    const trimmed = uri.trim();
    if (!trimmed) return;
    try {
        await Image.prefetch(trimmed);
    } catch {
        // Marker still renders; RN Image falls back to loading directly.
    }
}

/**
 * Prefetches memo photos and reveals map markers progressively so Google
 * Maps never snapshots hundreds of custom Marker views at once (which causes
 * missing pins and wrong cached bitmaps).
 *
 * The reveal is monotonic: once a marker is revealed it stays mounted until
 * its memory leaves the list. Toggling visibility off simply hides markers
 * without forgetting reveal state, so re-enabling is instant instead of
 * replaying the whole prefetch/reveal wave (which looked like flickering).
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

    const revealedIdsRef = useRef<Set<string>>(new Set());
    const [revealVersion, setRevealVersion] = useState(0);

    const active = mapReady && showMemories;

    // Forget markers whose memories were removed so their state is fresh if re-added.
    useEffect(() => {
        const currentIds = new Set(allItems.map(({ memory }) => memory.id));
        let pruned = false;
        revealedIdsRef.current.forEach((id) => {
            if (!currentIds.has(id)) {
                revealedIdsRef.current.delete(id);
                pruned = true;
            }
        });
        if (pruned) setRevealVersion((version) => version + 1);
    }, [allItems]);

    useEffect(() => {
        if (!active) return;

        const queue = allItems.filter(({ memory }) => !revealedIdsRef.current.has(memory.id));
        if (queue.length === 0) return;

        let cancelled = false;
        const pendingIds: string[] = [];

        const flush = () => {
            if (cancelled || pendingIds.length === 0) return;
            pendingIds.splice(0).forEach((id) => revealedIdsRef.current.add(id));
            setRevealVersion((version) => version + 1);
        };
        const flushInterval = setInterval(flush, REVEAL_FLUSH_INTERVAL_MS);

        let index = 0;
        const workers = Array.from({ length: PREFETCH_CONCURRENCY }, async () => {
            while (!cancelled && index < queue.length) {
                const item = queue[index++];
                await prefetchImage(item.memory.uri);
                if (!cancelled) pendingIds.push(item.memory.id);
            }
        });

        void Promise.all(workers).then(() => {
            clearInterval(flushInterval);
            flush();
        });

        return () => {
            cancelled = true;
            clearInterval(flushInterval);
        };
    }, [active, allItems]);

    return useMemo(() => {
        if (!active) return [];
        return allItems.filter(({ memory }) => revealedIdsRef.current.has(memory.id));
        // revealVersion invalidates this memo when the revealed set grows/shrinks.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, allItems, revealVersion]);
}
