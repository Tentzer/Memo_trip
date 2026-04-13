import * as Location from 'expo-location';

export const toDisplayFolderName = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());

export const toFolderLookupKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

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
        return toDisplayFolderName(admin1.long_name);
    }
    const countryName = country?.long_name?.trim();
    return countryName ? toDisplayFolderName(countryName) : '';
}

/**
 * Human-readable postal-style address from coordinates (Expo reverse geocode).
 */
export async function getFormattedAddressFromCoords(
    latitude: number,
    longitude: number
): Promise<string> {
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
            return toDisplayFolderName(region);
        }
        return country ? toDisplayFolderName(country) : 'Unknown Location';
    } catch (error) {
        console.error('Country lookup failed:', error);
        return 'Unknown Location';
    }
}
