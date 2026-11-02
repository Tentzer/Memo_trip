import { createBravePlacesClient } from '@/lib/places/braveProvider';
import { createGooglePlacesClient } from '@/lib/places/googleProvider';
import { isGooglePlaceId } from '@/lib/places/placeId';
import { parsePlacesProvider } from '@/lib/places/providerName';
import type { PlacesClient } from '@/lib/places/types';

export function configuredPlacesProvider() {
    return parsePlacesProvider(process.env.EXPO_PUBLIC_PLACES_PROVIDER);
}

export function createPlacesClient(): PlacesClient {
    const google = createGooglePlacesClient();
    const brave = createBravePlacesClient();
    const active = configuredPlacesProvider() === 'google' ? google : brave;
    return {
        search: (query, bias) => active.search(query, bias),
        nearby: (query, bias, radius) => active.nearby(query, bias, radius),
        details: (placeId, hint) => (
            isGooglePlaceId(placeId) ? google.details(placeId, hint) : active.details(placeId, hint)
        ),
        photos: (placeId, hint) => (
            isGooglePlaceId(placeId) ? google.photos(placeId, hint) : active.photos(placeId, hint)
        ),
    };
}

export function getPlacesClient(): PlacesClient {
    return createPlacesClient();
}
