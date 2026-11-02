import { Memory } from '@/types/memory';

export const UNKNOWN_COUNTRY_FOLDER = 'Unknown Location';
export const UNITED_STATES_FOLDER = 'United States';

/**
 * US state names that were stored in `memory.country`.
 * Georgia is omitted: it is also a country.
 */
const US_STATE_FOLDER_KEYS = new Set([
    'alabama',
    'alaska',
    'arizona',
    'arkansas',
    'california',
    'colorado',
    'connecticut',
    'delaware',
    'district of columbia',
    'florida',
    'hawaii',
    'idaho',
    'illinois',
    'indiana',
    'iowa',
    'kansas',
    'kentucky',
    'louisiana',
    'maine',
    'maryland',
    'massachusetts',
    'michigan',
    'minnesota',
    'mississippi',
    'missouri',
    'montana',
    'nebraska',
    'nevada',
    'new hampshire',
    'new jersey',
    'new mexico',
    'new york',
    'north carolina',
    'north dakota',
    'ohio',
    'oklahoma',
    'oregon',
    'pennsylvania',
    'rhode island',
    'south carolina',
    'south dakota',
    'tennessee',
    'texas',
    'utah',
    'vermont',
    'virginia',
    'washington',
    'west virginia',
    'wisconsin',
    'wyoming',
]);

const UNITED_STATES_ALIASES = new Set([
    'united states',
    'united states of america',
    'usa',
    'us',
    'u.s.',
    'u.s.a.',
]);

function folderLookupKey(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Folder label a memo is grouped under in the Countries tab. */
export function countryFolderName(memory: Pick<Memory, 'country'>): string {
    const raw = memory.country?.trim();
    if (!raw) return UNKNOWN_COUNTRY_FOLDER;
    const key = folderLookupKey(raw);
    if (UNITED_STATES_ALIASES.has(key) || US_STATE_FOLDER_KEYS.has(key)) {
        return UNITED_STATES_FOLDER;
    }
    return raw;
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
