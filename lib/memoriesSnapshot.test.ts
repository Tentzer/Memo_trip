import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CustomFolder, Memory } from '@/types/memory';

const mockMemoryStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: (key: string) => Promise.resolve(mockMemoryStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
        mockMemoryStore.set(key, value);
        return Promise.resolve();
    },
    removeItem: (key: string) => {
        mockMemoryStore.delete(key);
        return Promise.resolve();
    },
    multiGet: (keys: readonly string[]) => Promise.resolve(
        keys.map((key) => [key, mockMemoryStore.get(key) ?? null] as [string, string | null]),
    ),
    multiSet: (entries: readonly (readonly [string, string])[]) => {
        for (const [key, value] of entries) mockMemoryStore.set(key, value);
        return Promise.resolve();
    },
    multiRemove: (keys: readonly string[]) => {
        for (const key of keys) mockMemoryStore.delete(key);
        return Promise.resolve();
    },
    getAllKeys: () => Promise.resolve([...mockMemoryStore.keys()]),
}));

import {
    MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS,
    MEMORIES_SNAPSHOT_TTL_MS,
    clearMemoriesSnapshot,
    getMemoriesSnapshotStorageKey,
    loadMemoriesSnapshot,
    resetMemoriesSnapshotCacheForTests,
    saveMemoriesSnapshot,
    type MemoriesSnapshotData,
} from '@/lib/memoriesSnapshot';

function memory(id: string, uri = `https://example.com/${id}.jpg`): Memory {
    return {
        id,
        uri,
        latitude: 32.08,
        longitude: 34.78,
        created_at: '2026-01-01T00:00:00.000Z',
        customFolderIds: [],
    };
}

function folder(id: string): CustomFolder {
    return {
        id,
        name: `Folder ${id}`,
        created_at: '2026-01-01T00:00:00.000Z',
        owner_id: 'owner',
        role: 'owner',
        isShared: false,
    };
}

function snapshot(userSuffix = ''): MemoriesSnapshotData {
    const owned = memory(`owned${userSuffix}`);
    const shared = memory(`shared${userSuffix}`);
    return {
        memories: [owned],
        customFolders: [folder(`folder${userSuffix}`)],
        sharedMap: { [`lib${userSuffix}`]: [shared] },
    };
}

function keysFor(userId: string): string[] {
    return [...mockMemoryStore.keys()].filter((key) => key.includes(userId));
}

describe('memoriesSnapshot', () => {
    beforeEach(() => {
        mockMemoryStore.clear();
        resetMemoriesSnapshotCacheForTests();
        jest.restoreAllMocks();
    });

    it('round-trips memories, folders, and shared libraries', async () => {
        const data = snapshot();
        await saveMemoriesSnapshot('user-1', data);
        await expect(loadMemoriesSnapshot('user-1')).resolves.toEqual(data);
    });

    it('splits a large snapshot into chunks under the Android value limit', async () => {
        const fatUri = 'x'.repeat(100_000);
        const data: MemoriesSnapshotData = {
            memories: Array.from({ length: 8 }, (_, index) => memory(`m${index}`, fatUri)),
            customFolders: [],
            sharedMap: {},
        };

        await saveMemoriesSnapshot('user-1', data);

        const memoryKeys = keysFor('user-1').filter((key) => key.includes(':memories:'));
        expect(memoryKeys.length).toBeGreaterThan(1);
        for (const key of memoryKeys) {
            expect(mockMemoryStore.get(key)?.length ?? 0).toBeLessThanOrEqual(MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS);
        }
        await expect(loadMemoriesSnapshot('user-1')).resolves.toEqual(data);
    });

    it('drops extra chunk keys when a later save is smaller', async () => {
        const fatUri = 'x'.repeat(100_000);
        await saveMemoriesSnapshot('user-1', {
            memories: Array.from({ length: 8 }, (_, index) => memory(`m${index}`, fatUri)),
            customFolders: [],
            sharedMap: {},
        });
        await saveMemoriesSnapshot('user-1', {
            memories: [memory('only')],
            customFolders: [],
            sharedMap: {},
        });

        const memoryKeys = keysFor('user-1').filter((key) => key.includes(':memories:'));
        expect(memoryKeys).toEqual([
            expect.stringContaining(':memories:0'),
        ]);
        await expect(loadMemoriesSnapshot('user-1')).resolves.toMatchObject({
            memories: [memory('only')],
        });
    });

    it('returns null and deletes storage after the snapshot expires', async () => {
        const now = Date.parse('2026-01-01T00:00:00.000Z');
        jest.spyOn(Date, 'now').mockReturnValue(now);
        await saveMemoriesSnapshot('user-1', snapshot());

        jest.spyOn(Date, 'now').mockReturnValue(now + MEMORIES_SNAPSHOT_TTL_MS);
        await expect(loadMemoriesSnapshot('user-1')).resolves.toBeNull();
        expect(keysFor('user-1')).toEqual([]);

        await saveMemoriesSnapshot('user-1', snapshot());
        await expect(loadMemoriesSnapshot('user-1')).resolves.toEqual(snapshot());
    });

    it('keeps a snapshot that is still inside the ttl', async () => {
        const now = Date.parse('2026-01-01T00:00:00.000Z');
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const data = snapshot();
        await saveMemoriesSnapshot('user-1', data);
        jest.spyOn(Date, 'now').mockReturnValue(now + MEMORIES_SNAPSHOT_TTL_MS - 1_000);
        await expect(loadMemoriesSnapshot('user-1')).resolves.toEqual(data);
    });

    it('rejects a snapshot whose version does not match', async () => {
        await saveMemoriesSnapshot('user-1', snapshot());
        const metaKey = keysFor('user-1').find((key) => key.endsWith(':meta'));
        expect(metaKey).toBeTruthy();
        const meta = JSON.parse(mockMemoryStore.get(metaKey ?? '') ?? '{}') as { version: number };
        meta.version = 1;
        mockMemoryStore.set(metaKey ?? '', JSON.stringify(meta));

        await expect(loadMemoriesSnapshot('user-1')).resolves.toBeNull();
        expect(keysFor('user-1')).toEqual([]);
    });

    it('migrates a legacy single-record snapshot and removes that key', async () => {
        const data = snapshot();
        const legacy = {
            version: 1,
            savedAt: '2025-12-01T00:00:00.000Z',
            memories: data.memories,
            customFolders: data.customFolders,
            sharedMap: data.sharedMap,
        };
        mockMemoryStore.set(getMemoriesSnapshotStorageKey('user-1'), JSON.stringify(legacy));

        await expect(loadMemoriesSnapshot('user-1')).resolves.toEqual(data);
        expect(mockMemoryStore.has(getMemoriesSnapshotStorageKey('user-1'))).toBe(false);
        expect(keysFor('user-1').some((key) => key.endsWith(':meta'))).toBe(true);
    });

    it('deletes an invalid legacy record', async () => {
        const legacyKey = getMemoriesSnapshotStorageKey('user-1');
        mockMemoryStore.set(legacyKey, '{"version":1}');
        await expect(loadMemoriesSnapshot('user-1')).resolves.toBeNull();
        expect(mockMemoryStore.has(legacyKey)).toBe(false);
    });

    it('clears one user on logout and ignores saves until the next load', async () => {
        const first = snapshot('-a');
        const second = snapshot('-b');
        await saveMemoriesSnapshot('user-a', first);
        await saveMemoriesSnapshot('user-b', second);

        await clearMemoriesSnapshot('user-a');
        expect(keysFor('user-a')).toEqual([]);
        await saveMemoriesSnapshot('user-a', first);
        expect(keysFor('user-a')).toEqual([]);
        await expect(loadMemoriesSnapshot('user-b')).resolves.toEqual(second);

        await expect(loadMemoriesSnapshot('user-a')).resolves.toBeNull();
        await saveMemoriesSnapshot('user-a', first);
        await expect(loadMemoriesSnapshot('user-a')).resolves.toEqual(first);
    });
});
