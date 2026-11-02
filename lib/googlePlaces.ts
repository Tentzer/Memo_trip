import {
    getFolderNameFromGoogleAddressComponents,
    normalizeLocationFolderName,
    type GoogleAddressComponent,
} from '@/lib/geocoding';
import { mapGooglePlaceCategory } from '@/lib/places/placeCategorySignals';
import type { PlaceDetails, PlacePrediction } from '@/lib/places/types';

export type { PlaceDetails as GooglePlaceDetails, PlacePrediction };

export async function fetchGooglePlacePredictions(
    text: string,
    googleApiKey: string | undefined
): Promise<PlacePrediction[]> {
    if (!googleApiKey || text.length < 3) {
        return [];
    }

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${googleApiKey}`
    );
    const json = await response.json();
    return json.predictions ?? [];
}

async function fetchFolderNameFromExternalCoords(
    latitude: number,
    longitude: number
): Promise<string | null> {
    try {
        const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
        );
        const data = await response.json();
        return data.countryName ? normalizeLocationFolderName(data.countryName) : null;
    } catch {
        return null;
    }
}

async function fetchFolderNameFromGoogleCoords(
    latitude: number,
    longitude: number,
    googleApiKey: string
): Promise<string | null> {
    const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=en&key=${googleApiKey}`
    );
    const data = await response.json();
    const components = data.results
        ?.flatMap((result: any) => result.address_components ?? []) as GoogleAddressComponent[] | undefined;
    const folderName = getFolderNameFromGoogleAddressComponents(components);

    return folderName || await fetchFolderNameFromExternalCoords(latitude, longitude);
}

/**
 * Country folder for a place. Address components win. Otherwise the existing
 * reverse-geocode path (Google, then BigDataCloud) is unchanged.
 */
export async function resolvePlaceCountry(
    latitude: number,
    longitude: number,
    components: GoogleAddressComponent[] | undefined,
    googleApiKey: string | undefined,
): Promise<string | null> {
    const fromComponents = getFolderNameFromGoogleAddressComponents(components);
    if (fromComponents) return fromComponents;
    if (googleApiKey) return fetchFolderNameFromGoogleCoords(latitude, longitude, googleApiKey);
    return fetchFolderNameFromExternalCoords(latitude, longitude);
}

function todaysHours(weekdayText: string[] | undefined): string | undefined {
    if (!weekdayText?.length) return undefined;
    const jsDay = new Date().getDay();
    const googleDay = jsDay === 0 ? 6 : jsDay - 1;
    return weekdayText[googleDay] ?? weekdayText[0];
}

export async function fetchGooglePlaceDetails(
    placeId: string,
    description: string,
    googleApiKey: string | undefined,
    options?: { includePhotos?: boolean },
): Promise<PlaceDetails | null> {
    if (!googleApiKey) {
        return null;
    }

    const fields = [
        'geometry',
        'address_components',
        'types',
        'name',
        'formatted_address',
        'formatted_phone_number',
        'website',
        'opening_hours',
        'rating',
        'user_ratings_total',
    ];
    if (options?.includePhotos) fields.push('photos');

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields.join(',')}&language=en&key=${googleApiKey}`
    );
    const data = await response.json();
    const result = data.result;
    const components = result?.address_components as GoogleAddressComponent[] | undefined;

    if (!result?.geometry) {
        return null;
    }

    const latitude = result.geometry.location.lat;
    const longitude = result.geometry.location.lng;
    const country = await resolvePlaceCountry(latitude, longitude, components, googleApiKey);
    const types = Array.isArray(result.types) ? result.types as string[] : [];
    const primaryType = typeof result.primaryType === 'string'
        ? result.primaryType
        : typeof result.primary_type === 'string'
            ? result.primary_type
            : undefined;
    const name = typeof result.name === 'string' ? result.name : description;

    return {
        latitude,
        longitude,
        photoReference: options?.includePhotos ? result.photos?.[0]?.photo_reference ?? null : null,
        country,
        title: description,
        address: typeof result.formatted_address === 'string' ? result.formatted_address : undefined,
        phone: typeof result.formatted_phone_number === 'string' ? result.formatted_phone_number : undefined,
        website: typeof result.website === 'string' ? result.website : undefined,
        hours: todaysHours(result.opening_hours?.weekday_text),
        rating: typeof result.rating === 'number' ? result.rating : undefined,
        reviewCount: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : undefined,
        placeId,
        category: mapGooglePlaceCategory({ name, primaryType, types, description }),
    };
}

export async function fetchGooglePlacePhotoReference(
    placeId: string,
    googleApiKey: string | undefined,
): Promise<string | null> {
    if (!googleApiKey) return null;
    const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${googleApiKey}`
    );
    const data = await response.json();
    const reference = data.result?.photos?.[0]?.photo_reference;
    return typeof reference === 'string' && reference.trim() ? reference : null;
}
