import type { CustomFolder, Memory } from '@/types/memory';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    chunkItems,
    chunkKey,
    deleteStoredSnapshot,
    flattenShared,
    isLegacySnapshot,
    legacySnapshotKey,
    MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS,
    MEMORIES_SNAPSHOT_VERSION,
    metaKey,
    parseMeta,
    readChunkedSnapshot,
    removeExtraChunkKeys,
    type SnapshotMeta,
} from '@/lib/memoriesSnapshotCodec';

export { MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS, MEMORIES_SNAPSHOT_VERSION };
export const MEMORIES_SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type MemoriesSnapshotData = {
    memories: Memory[];
    customFolders: CustomFolder[];
    sharedMap: Record<string, Memory[]>;
};

const invalidatedUserIds = new Set<string>();

export const getMemoriesSnapshotStorageKey = legacySnapshotKey;

export function resetMemoriesSnapshotCacheForTests(): void {
    invalidatedUserIds.clear();
}

async function migrateLegacySnapshot(userId: string): Promise<MemoriesSnapshotData | null> {
    const legacyKey = legacySnapshotKey(userId);
    const raw = await AsyncStorage.getItem(legacyKey);
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        await AsyncStorage.removeItem(legacyKey);
        return null;
    }
    if (!isLegacySnapshot(parsed)) {
        await AsyncStorage.removeItem(legacyKey);
        return null;
    }
    const data: MemoriesSnapshotData = {
        memories: parsed.memories,
        customFolders: parsed.customFolders,
        sharedMap: parsed.sharedMap,
    };
    await saveMemoriesSnapshot(userId, data);
    return data;
}

export async function loadMemoriesSnapshot(userId: string): Promise<MemoriesSnapshotData | null> {
    invalidatedUserIds.delete(userId);
    try {
        const metaRaw = await AsyncStorage.getItem(metaKey(userId));
        if (!metaRaw) {
            return migrateLegacySnapshot(userId);
        }
        const meta = parseMeta(metaRaw);
        if (!meta) {
            await deleteStoredSnapshot(userId);
            return null;
        }
        const expiresAtMs = Date.parse(meta.expiresAt);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
            await deleteStoredSnapshot(userId);
            return null;
        }
        const data = await readChunkedSnapshot(userId, meta);
        if (!data) {
            await deleteStoredSnapshot(userId);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Could not load memories snapshot:', error);
        return null;
    }
}

export async function saveMemoriesSnapshot(userId: string, data: MemoriesSnapshotData): Promise<void> {
    if (invalidatedUserIds.has(userId)) return;
    try {
        const savedAtMs = Date.now();
        const memoryChunks = chunkItems(data.memories);
        const folderChunks = chunkItems(data.customFolders);
        const sharedChunks = chunkItems(flattenShared(data.sharedMap));
        const meta: SnapshotMeta = {
            version: MEMORIES_SNAPSHOT_VERSION,
            savedAt: new Date(savedAtMs).toISOString(),
            expiresAt: new Date(savedAtMs + MEMORIES_SNAPSHOT_TTL_MS).toISOString(),
            memoryChunks: memoryChunks.length,
            folderChunks: folderChunks.length,
            sharedChunks: sharedChunks.length,
        };
        const entries: [string, string][] = [[metaKey(userId), JSON.stringify(meta)]];
        memoryChunks.forEach((chunk, index) => entries.push([chunkKey(userId, 'memories', index), chunk]));
        folderChunks.forEach((chunk, index) => entries.push([chunkKey(userId, 'folders', index), chunk]));
        sharedChunks.forEach((chunk, index) => entries.push([chunkKey(userId, 'shared', index), chunk]));
        if (invalidatedUserIds.has(userId)) return;
        await AsyncStorage.multiSet(entries);
        if (invalidatedUserIds.has(userId)) {
            await deleteStoredSnapshot(userId);
            return;
        }
        await removeExtraChunkKeys(userId, meta);
        await AsyncStorage.removeItem(legacySnapshotKey(userId));
    } catch (error) {
        console.error('Could not save memories snapshot:', error);
    }
}

export async function clearMemoriesSnapshot(userId: string): Promise<void> {
    invalidatedUserIds.add(userId);
    try {
        await deleteStoredSnapshot(userId);
    } catch (error) {
        console.error('Could not clear memories snapshot:', error);
    }
}
