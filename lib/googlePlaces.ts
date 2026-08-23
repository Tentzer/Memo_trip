import {
    getFolderNameFromGoogleAddressComponents,
    normalizeLocationFolderName,
    type GoogleAddressComponent,
} from '@/lib/geocoding';

export interface PlacePrediction {
    place_id: string;
    description: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
}

export interface GooglePlaceDetails {
    latitude: number;
    longitude: number;
    photoReference: string | null;
    country: string | null;
    title: string;
}

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
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${googleApiKey}`
    );
    const data = await response.json();
    const components = data.results
        ?.flatMap((result: any) => result.address_components ?? []) as GoogleAddressComponent[] | undefined;
    const folderName = getFolderNameFromGoogleAddressComponents(components);

    return folderName || await fetchFolderNameFromExternalCoords(latitude, longitude);
}

export async function fetchGooglePlaceDetails(
    placeId: string,
    description: string,
    googleApiKey: string | undefined
): Promise<GooglePlaceDetails | null> {
    if (!googleApiKey) {
        return null;
    }

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=geometry,photos,address_components&key=${googleApiKey}`
    );
    const data = await response.json();
    const components = data.result?.address_components as GoogleAddressComponent[] | undefined;

    if (!data.result?.geometry) {
        return null;
    }

    const latitude = data.result.geometry.location.lat;
    const longitude = data.result.geometry.location.lng;
    const placeDetailsCountry = getFolderNameFromGoogleAddressComponents(components);
    const country = placeDetailsCountry || await fetchFolderNameFromGoogleCoords(latitude, longitude, googleApiKey);

    return {
        latitude,
        longitude,
        photoReference: data.result.photos?.[0]?.photo_reference ?? null,
        country,
        title: description,
    };
}
