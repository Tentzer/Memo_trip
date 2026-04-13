import AsyncStorage from '@react-native-async-storage/async-storage';
import { MemoryMeta } from '@/types/memory';

export const getCustomFoldersStorageKey = (userId: string) => `memoTrip:customFolders:${userId}`;
export const getMemoryMetaStorageKey = (userId: string) => `memoTrip:memoryMeta:${userId}`;
export const getLibrariesMigratedKey = (userId: string) => `memoTrip:librariesMigrated:${userId}`;

export async function loadMemoryMeta(userId: string): Promise<Record<string, MemoryMeta>> {
    try {
        const storedValue = await AsyncStorage.getItem(getMemoryMetaStorageKey(userId));
        return storedValue ? JSON.parse(storedValue) : {};
    } catch (error) {
        console.error('Could not load memory metadata:', error);
        return {};
    }
}

export async function saveMemoryMeta(userId: string, nextMeta: Record<string, MemoryMeta>): Promise<void> {
    try {
        await AsyncStorage.setItem(getMemoryMetaStorageKey(userId), JSON.stringify(nextMeta));
    } catch (error) {
        console.error('Could not save memory metadata:', error);
    }
}
