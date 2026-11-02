import { describe, expect, it } from '@jest/globals';
import { createMarkerSnapshotScheduler } from '@/lib/markerSnapshotScheduler';

describe('marker snapshot scheduler', () => {
    it('grants only the concurrency limit until a slot is released', async () => {
        const scheduler = createMarkerSnapshotScheduler(2);
        const first = await scheduler.acquire();
        const second = await scheduler.acquire();
        let thirdGranted = false;
        const third = scheduler.acquire().then((release) => {
            thirdGranted = true;
            return release;
        });

        expect(thirdGranted).toBe(false);
        expect(scheduler.activeCount()).toBe(2);
        expect(scheduler.pendingCount()).toBe(1);

        first();
        const thirdRelease = await third;
        expect(thirdGranted).toBe(true);
        expect(scheduler.activeCount()).toBe(2);

        second();
        thirdRelease();
        expect(scheduler.activeCount()).toBe(0);
    });

    it('ignores a second release of the same slot', async () => {
        const scheduler = createMarkerSnapshotScheduler(1);
        const release = await scheduler.acquire();
        release();
        release();
        expect(scheduler.activeCount()).toBe(0);
        const next = await scheduler.acquire();
        expect(scheduler.activeCount()).toBe(1);
        next();
    });
});
