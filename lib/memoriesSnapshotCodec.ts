import type { CustomFolder, Memory } from '@/types/memory';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MEMORIES_SNAPSHOT_VERSION = 2 as const;
/** Stay under Android's per-value CursorWindow limit. */
export const MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS = 350_000;

const LEGACY_VERSION = 1 as const;

export type SnapshotMeta = {
    version: typeof MEMORIES_SNAPSHOT_VERSION;
    savedAt: string;
    expiresAt: string;
    memoryChunks: number;
    folderChunks: number;
    sharedChunks: number;
};

type SharedRecord = {
    libraryId: string;
    memory: Memory;
};

export function legacySnapshotKey(userId: string): string {
    return `memoTrip:memoriesSnapshot:${userId}`;
}

export function snapshotPrefix(userId: string): string {
    return `memoTrip:memoriesSnapshot:v${MEMORIES_SNAPSHOT_VERSION}:${userId}:`;
}

export function metaKey(userId: string): string {
    return `${snapshotPrefix(userId)}meta`;
}

export function chunkKey(userId: string, kind: 'memories' | 'folders' | 'shared', index: number): string {
    return `${snapshotPrefix(userId)}${kind}:${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChunkCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isMemory(value: unknown): value is Memory {
    if (!isRecord(value)) return false;
    if (typeof value.id !== 'string' || typeof value.uri !== 'string') return false;
    if (typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return false;
    if (typeof value.created_at !== 'string') return false;
    if (value.thumb_uri != null && typeof value.thumb_uri !== 'string') return false;
    if (value.customFolderIds != null && !Array.isArray(value.customFolderIds)) return false;
    return true;
}

function isFolder(value: unknown): value is CustomFolder {
    return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isVersionedSnapshotKey(key: string, userId: string): boolean {
    const match = /^memoTrip:memoriesSnapshot:v\d+:([^:]+):/.exec(key);
    return match?.[1] === userId;
}

export function chunkItems<T>(items: T[]): string[] {
    if (items.length === 0) return [];
    const chunks: string[] = [];
    let batch: T[] = [];
    let batchChars = 2;
    for (const item of items) {
        const encoded = JSON.stringify(item);
        const separator = batch.length > 0 ? 1 : 0;
        if (batch.length > 0 && batchChars + separator + encoded.length > MEMORIES_SNAPSHOT_MAX_CHUNK_CHARS) {
            chunks.push(JSON.stringify(batch));
            batch = [item];
            batchChars = 2 + encoded.length;
            continue;
        }
        batch.push(item);
        batchChars += separator + encoded.length;
    }
    if (batch.length > 0) chunks.push(JSON.stringify(batch));
    return chunks;
}

export function flattenShared(sharedMap: Record<string, Memory[]>): SharedRecord[] {
    const records: SharedRecord[] = [];
    for (const libraryId of Object.keys(sharedMap).sort()) {
        for (const memory of sharedMap[libraryId] ?? []) {
            records.push({ libraryId, memory });
        }
    }
    return records;
}

function groupShared(records: SharedRecord[]): Record<string, Memory[]> {
    const sharedMap: Record<string, Memory[]> = {};
    for (const record of records) {
        const existing = sharedMap[record.libraryId] ?? [];
        existing.push(record.memory);
        sharedMap[record.libraryId] = existing;
    }
    return sharedMap;
}

export function parseMeta(raw: string | null): SnapshotMeta | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || parsed.version !== MEMORIES_SNAPSHOT_VERSION) return null;
        if (typeof parsed.savedAt !== 'string' || typeof parsed.expiresAt !== 'string') return null;
        if (!isChunkCount(parsed.memoryChunks) || !isChunkCount(parsed.folderChunks) || !isChunkCount(parsed.sharedChunks)) {
            return null;
        }
        return {
            version: MEMORIES_SNAPSHOT_VERSION,
            savedAt: parsed.savedAt,
            expiresAt: parsed.expiresAt,
            memoryChunks: parsed.memoryChunks,
            folderChunks: parsed.folderChunks,
            sharedChunks: parsed.sharedChunks,
        };
    } catch {
        return null;
    }
}

async function readJsonChunks(keys: string[]): Promise<unknown[][] | null> {
    if (keys.length === 0) return [];
    const pairs = await AsyncStorage.multiGet(keys);
    const chunks: unknown[][] = [];
    for (const [, value] of pairs) {
        if (!value) return null;
        try {
            const parsed: unknown = JSON.parse(value);
            if (!Array.isArray(parsed)) return null;
            chunks.push(parsed);
        } catch {
            return null;
        }
    }
    return chunks;
}

function takeMemories(chunks: unknown[][]): Memory[] | null {
    const memories: Memory[] = [];
    for (const chunk of chunks) {
        for (const item of chunk) {
            if (!isMemory(item)) return null;
            memories.push(item);
        }
    }
    return memories;
}

function takeFolders(chunks: unknown[][]): CustomFolder[] | null {
    const folders: CustomFolder[] = [];
    for (const chunk of chunks) {
        for (const item of chunk) {
            if (!isFolder(item)) return null;
            folders.push(item);
        }
    }
    return folders;
}

function takeShared(chunks: unknown[][]): Record<string, Memory[]> | null {
    const records: SharedRecord[] = [];
    for (const chunk of chunks) {
        for (const item of chunk) {
            if (!isRecord(item) || typeof item.libraryId !== 'string' || !isMemory(item.memory)) return null;
            records.push({ libraryId: item.libraryId, memory: item.memory });
        }
    }
    return groupShared(records);
}

export async function readChunkedSnapshot(
    userId: string,
    meta: SnapshotMeta,
): Promise<{ memories: Memory[]; customFolders: CustomFolder[]; sharedMap: Record<string, Memory[]> } | null> {
    const [memoryChunks, folderChunks, sharedChunks] = await Promise.all([
        readJsonChunks(Array.from({ length: meta.memoryChunks }, (_, index) => chunkKey(userId, 'memories', index))),
        readJsonChunks(Array.from({ length: meta.folderChunks }, (_, index) => chunkKey(userId, 'folders', index))),
        readJsonChunks(Array.from({ length: meta.sharedChunks }, (_, index) => chunkKey(userId, 'shared', index))),
    ]);
    if (!memoryChunks || !folderChunks || !sharedChunks) return null;
    const memories = takeMemories(memoryChunks);
    const customFolders = takeFolders(folderChunks);
    const sharedMap = takeShared(sharedChunks);
    if (!memories || !customFolders || !sharedMap) return null;
    return { memories, customFolders, sharedMap };
}

export async function deleteStoredSnapshot(userId: string): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const legacyKey = legacySnapshotKey(userId);
    const prefix = snapshotPrefix(userId);
    const matches = keys.filter((key) =>
        key === legacyKey || key.startsWith(prefix) || isVersionedSnapshotKey(key, userId)
    );
    if (matches.length > 0) {
        await AsyncStorage.multiRemove(matches);
    }
}

export async function removeExtraChunkKeys(userId: string, meta: SnapshotMeta): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = snapshotPrefix(userId);
    const stale = keys.filter((key) => {
        if (!key.startsWith(prefix) || key === metaKey(userId)) return false;
        const match = /:(memories|folders|shared):(\d+)$/.exec(key);
        if (!match) return false;
        const index = Number(match[2]);
        const count = match[1] === 'memories'
            ? meta.memoryChunks
            : match[1] === 'folders'
                ? meta.folderChunks
                : meta.sharedChunks;
        return index >= count;
    });
    if (stale.length > 0) {
        await AsyncStorage.multiRemove(stale);
    }
}

export function isLegacySnapshot(value: unknown): value is {
    version: typeof LEGACY_VERSION;
    savedAt: string;
    memories: Memory[];
    customFolders: CustomFolder[];
    sharedMap: Record<string, Memory[]>;
} {
    if (!isRecord(value)) return false;
    if (value.version !== LEGACY_VERSION || typeof value.savedAt !== 'string') return false;
    if (!Array.isArray(value.memories) || !value.memories.every(isMemory)) return false;
    if (!Array.isArray(value.customFolders) || !value.customFolders.every(isFolder)) return false;
    if (!isRecord(value.sharedMap)) return false;
    return Object.values(value.sharedMap).every((entry) => Array.isArray(entry) && entry.every(isMemory));
}
