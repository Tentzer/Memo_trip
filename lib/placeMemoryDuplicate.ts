import { normalizeLocationFolderName, toFolderLookupKey } from '@/lib/geocoding';
import type { Memory } from '@/types/memory';

/** ~5.5 m; matches map place picker duplicate check in Home.tsx */
export const PLACE_COORD_EPSILON = 0.00005;

export function countryFolderLookupKey(country: string): string {
    return toFolderLookupKey(normalizeLocationFolderName(country));
}

export function areCoordsSamePlace(
    latA: number,
    lngA: number,
    latB: number,
    lngB: number,
    epsilon = PLACE_COORD_EPSILON,
): boolean {
    return Math.abs(latA - latB) < epsilon && Math.abs(lngA - lngB) < epsilon;
}

/** True if the user already has a memo in this country folder at the same coordinates. */
export function hasDuplicateInCountryFolder(
    memories: Memory[],
    lat: number,
    lng: number,
    country: string,
): boolean {
    const folderKey = countryFolderLookupKey(country);
    return memories.some(
        (m) =>
            !m.deletedAt &&
            !m.excludeFromCountryFolder &&
            !!m.country &&
            countryFolderLookupKey(m.country) === folderKey &&
            areCoordsSamePlace(lat, lng, m.latitude, m.longitude),
    );
}
