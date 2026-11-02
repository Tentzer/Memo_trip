import { parsePlacesProvider } from '../../../lib/places/providerName.ts';
import { searchBravePlaces } from '../_shared/brave_search.ts';
import type { RecommendedPlace } from './plan_agent_types.ts';

export function placesProvider() {
    return parsePlacesProvider(Deno.env.get('PLACES_PROVIDER'));
}

function braveKey(): string {
    const key = Deno.env.get('BRAVE_SEARCH_API_KEY')?.trim() ?? '';
    if (!key) throw new Error('Place search is not configured.');
    return key;
}

export async function countryFromCoords(lat: number, lng: number, googleKey: string): Promise<string> {
    if (!googleKey) return '';
    try {
        const params = new URLSearchParams({
            latlng: `${lat},${lng}`,
            result_type: 'country',
            key: googleKey,
        });
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
        const data = await res.json();
        const components: { types: string[]; long_name: string }[] =
            data.results?.[0]?.address_components ?? [];
        return components.find((component) => component.types.includes('country'))?.long_name ?? '';
    } catch {
        return '';
    }
}

export async function fetchBraveRecommended(
    query: string,
    lat: number,
    lng: number,
    radiusMeters: number,
): Promise<RecommendedPlace[]> {
    const places = await searchBravePlaces({
        query,
        latitude: lat,
        longitude: lng,
        radiusMeters,
    }, braveKey());
    return places.map((place) => ({
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingsTotal: place.reviewCount,
        placeId: place.placeId,
        photoReference: place.photoUrls[0] ?? null,
        lat: place.latitude,
        lng: place.longitude,
        country: '',
        description: '',
        openingHours: place.hours ?? null,
        placeCategory: place.category,
    }));
}
