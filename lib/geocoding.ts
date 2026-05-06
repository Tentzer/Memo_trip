import * as Location from 'expo-location';

const formattedAddressCache = new Map<string, string>();
const formattedAddressRequests = new Map<string, Promise<string>>();

function getCoordinateCacheKey(latitude: number, longitude: number): string {
    return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

export const toDisplayFolderName = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());

export const toFolderLookupKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const usStateAbbreviationDisplayNames: Record<string, string> = {
    ca: 'California',
    ny: 'New York',
    va: 'Virginia',
};

export function normalizeLocationFolderName(value: string): string {
    const displayName = toDisplayFolderName(value);
    return usStateAbbreviationDisplayNames[toFolderLookupKey(displayName)] ?? displayName;
}

/** Google Places address_components item */
export type GoogleAddressComponent = {
    long_name: string;
    short_name: string;
    types: string[];
};

/**
 * Folder label for memos: US uses state (administrative_area_level_1), else country.
 */
export function getFolderNameFromGoogleAddressComponents(
    components: GoogleAddressComponent[] | undefined
): string {
    if (!components?.length) return '';
    const country = components.find(c => c.types.includes('country'));
    const admin1 = components.find(c => c.types.includes('administrative_area_level_1'));
    const isUS = country?.short_name === 'US';
    if (isUS && admin1?.long_name?.trim()) {
        return normalizeLocationFolderName(admin1.long_name);
    }
    const countryName = country?.long_name?.trim();
    return countryName ? normalizeLocationFolderName(countryName) : '';
}

/**
 * Human-readable postal-style address from coordinates (Expo reverse geocode).
 */
export function getCachedFormattedAddressFromCoords(
    latitude: number,
    longitude: number
): string | null {
    const key = getCoordinateCacheKey(latitude, longitude);
    return formattedAddressCache.get(key) ?? null;
}

export async function getFormattedAddressFromCoords(
    latitude: number,
    longitude: number
): Promise<string> {
    const key = getCoordinateCacheKey(latitude, longitude);
    const cachedAddress = formattedAddressCache.get(key);
    if (cachedAddress !== undefined) {
        return cachedAddress;
    }

    const inFlightRequest = formattedAddressRequests.get(key);
    if (inFlightRequest) {
        return inFlightRequest;
    }

    const request = (async () => {
    try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const r = results[0];
        if (!r) return '';

        const streetLine = [r.streetNumber, r.street].filter(Boolean).join(' ').trim();
        const cityPart = [r.city || r.district || r.subregion, r.region].filter(Boolean).join(', ');
        const segments: string[] = [];
        if (streetLine) segments.push(streetLine);
        if (cityPart) segments.push(cityPart);
        if (r.postalCode?.trim()) segments.push(r.postalCode.trim());
        if (r.country?.trim()) segments.push(r.country.trim());
        if (segments.length > 0) {
            return segments.join(', ');
        }
        if (r.name?.trim()) return r.name.trim();
        return '';
    } catch (error) {
        console.error('Address lookup failed:', error);
        return '';
    }
    })();

    formattedAddressRequests.set(key, request);

    try {
        const resolvedAddress = await request;
        formattedAddressCache.set(key, resolvedAddress);
        return resolvedAddress;
    } finally {
        formattedAddressRequests.delete(key);
    }
}

export async function getCountryNameFromCoords(latitude: number, longitude: number): Promise<string> {
    try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const r = results[0];
        if (!r) return 'Unknown Location';

        const country = r.country?.trim();
        const region = r.region?.trim();
        const isUS =
            country === 'United States' ||
            country === 'United States of America' ||
            country === 'USA';

        if (isUS && region) {
            return normalizeLocationFolderName(region);
        }
        return country ? normalizeLocationFolderName(country) : 'Unknown Location';
    } catch (error) {
        console.error('Country lookup failed:', error);
        return 'Unknown Location';
    }
}
