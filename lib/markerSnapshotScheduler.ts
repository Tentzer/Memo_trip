/** How long Google Maps may snapshot a marker after its photo is on screen. */
export const MARKER_PAINT_WINDOW_MS = 320;

/** Custom-marker snapshots running at once. More than this freezes the map. */
export const MARKER_SNAPSHOT_CONCURRENCY = 3;

export type MarkerSnapshotRelease = () => void;

/**
 * Limits how many marker views are snapshotted at once.
 * acquire() resolves with an idempotent release that must run when the window ends or the marker unmounts.
 */
export function createMarkerSnapshotScheduler(concurrency = MARKER_SNAPSHOT_CONCURRENCY) {
    let active = 0;
    const waiters: Array<() => void> = [];

    const grantNext = () => {
        const next = waiters.shift();
        if (next) next();
    };

    return {
        acquire(): Promise<MarkerSnapshotRelease> {
            return new Promise((resolve) => {
                const grant = () => {
                    active += 1;
                    let released = false;
                    resolve(() => {
                        if (released) return;
                        released = true;
                        active -= 1;
                        grantNext();
                    });
                };
                if (active < concurrency) grant();
                else waiters.push(grant);
            });
        },
        pendingCount(): number {
            return waiters.length;
        },
        activeCount(): number {
            return active;
        },
    };
}

export const markerSnapshotScheduler = createMarkerSnapshotScheduler();
