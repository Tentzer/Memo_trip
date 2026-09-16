import { Memory } from '@/types/memory';

export const UNKNOWN_COUNTRY_FOLDER = 'Unknown Location';

/** Folder label a memo is grouped under in the Countries tab. */
export function countryFolderName(memory: Pick<Memory, 'country'>): string {
    return memory.country || UNKNOWN_COUNTRY_FOLDER;
}

/** Country folders show live memos only; marketplace downloads stay in their own library. */
export function belongsToCountryFolders(memory: Memory): boolean {
    return !memory.deletedAt && !memory.excludeFromCountryFolder;
}

export function getCountryFolderMemories(memories: Memory[], countryName: string): Memory[] {
    return memories.filter(
        memory => belongsToCountryFolders(memory) && countryFolderName(memory) === countryName,
    );
}
