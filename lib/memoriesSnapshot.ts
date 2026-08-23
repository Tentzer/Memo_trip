import type { LoadedMemories } from '@/lib/memoryApi';
import { CustomFolder, Memory } from '@/types/memory';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SNAPSHOT_VERSION = 1 as const;

export const getMemoriesSnapshotStorageKey = (userId: string) => `memoTrip:memoriesSnapshot:${userId}`;

type StoredSnapshot = {
    version: typeof SNAPSHOT_VERSION;
    savedAt: string;
    memories: Memory[];
    customFolders: CustomFolder[];
    sharedMap: Record<string, Memory[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSnapshot(raw: unknown): raw is StoredSnapshot {
    if (!isRecord(raw)) return false;
    if (raw.version !== SNAPSHOT_VERSION) return false;
    if (typeof raw.savedAt !== 'string') return false;
    if (!Array.isArray(raw.memories)) return false;
    if (!Array.isArray(raw.customFolders)) return false;
    if (!isRecord(raw.sharedMap)) return false;
    for (const v of Object.values(raw.sharedMap)) {
        if (!Array.isArray(v)) return false;
    }
    return true;
}

export async function loadMemoriesSnapshot(userId: string): Promise<LoadedMemories | null> {
    try {
        const storedValue = await AsyncStorage.getItem(getMemoriesSnapshotStorageKey(userId));
        if (!storedValue) return null;
        const parsed: unknown = JSON.parse(storedValue);
        if (!isValidSnapshot(parsed)) return null;
        return {
            memories: parsed.memories,
            customFolders: parsed.customFolders,
            sharedMap: parsed.sharedMap,
        };
    } catch (error) {
        console.error('Could not load memories snapshot:', error);
        return null;
    }
}

export async function saveMemoriesSnapshot(userId: string, data: LoadedMemories): Promise<void> {
    try {
        const payload: StoredSnapshot = {
            version: SNAPSHOT_VERSION,
            savedAt: new Date().toISOString(),
            memories: data.memories,
            customFolders: data.customFolders,
            sharedMap: data.sharedMap,
        };
        await AsyncStorage.setItem(getMemoriesSnapshotStorageKey(userId), JSON.stringify(payload));
    } catch (error) {
        console.error('Could not save memories snapshot:', error);
    }
}
