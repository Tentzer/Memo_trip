import { resolvePlaceCountry } from '@/lib/googlePlaces';
import { userMessageFromInvokeError } from '@/lib/paidEndpointError';
import { supabase } from '@/lib/supabase';
import type { PlaceDetails, PlaceLookupHint, PlacePrediction, PlacesClient } from '@/lib/places/types';

interface ProxyPrediction extends PlacePrediction {
    photoUrls?: string[];
}

function googleKey(): string | undefined {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    return key || undefined;
}

async function invokePlaces<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke<T>('places-proxy', { body });
    if (error) throw new Error(await userMessageFromInvokeError(error, 'places'));
    if (!data) throw new Error('No response from place search.');
    return data;
}

function hintFromPrediction(place: PlacePrediction): PlaceLookupHint {
    return {
        title: place.structured_formatting?.main_text || place.description,
        description: place.description,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        category: place.category,
        rating: place.rating,
        reviewCount: place.reviewCount,
        phone: place.phone,
        website: place.website,
        hours: place.hours,
    };
}

async function withCountry(place: PlaceDetails): Promise<PlaceDetails> {
    if (place.country) return place;
    const country = await resolvePlaceCountry(
        place.latitude,
        place.longitude,
        undefined,
        googleKey(),
    );
    return { ...place, country };
}

function detailsFromHint(placeId: string, hint: PlaceLookupHint): PlaceDetails | null {
    if (hint.latitude == null || hint.longitude == null) return null;
    return {
        latitude: hint.latitude,
        longitude: hint.longitude,
        photoReference: null,
        country: null,
        title: hint.title || hint.description || placeId,
        address: hint.address,
        category: hint.category,
        rating: hint.rating,
        reviewCount: hint.reviewCount,
        phone: hint.phone,
        website: hint.website,
        hours: hint.hours,
        placeId,
    };
}

function withoutPhotoUrls(places: ProxyPrediction[]): PlacePrediction[] {
    return places.map((place) => {
        const prediction = { ...place };
        delete prediction.photoUrls;
        return prediction;
    });
}

export function createBravePlacesClient(): PlacesClient {
    return {
        async search(query, bias) {
            const data = await invokePlaces<{ predictions: ProxyPrediction[] }>({
                op: 'search',
                query,
                latitude: bias?.latitude,
                longitude: bias?.longitude,
            });
            return withoutPhotoUrls(data.predictions ?? []);
        },
        async nearby(query, bias, radiusMeters) {
            const data = await invokePlaces<{ predictions: ProxyPrediction[] }>({
                op: 'nearby',
                query,
                latitude: bias.latitude,
                longitude: bias.longitude,
                radiusMeters,
            });
            return withoutPhotoUrls(data.predictions ?? []);
        },
        async details(placeId, hint) {
            const local = hint ? detailsFromHint(placeId, hint) : null;
            if (local) return withCountry(local);
            const data = await invokePlaces<{ place: PlaceDetails | null }>({
                op: 'details',
                placeId,
                query: hint?.title,
                title: hint?.title,
                address: hint?.address,
                latitude: hint?.latitude,
                longitude: hint?.longitude,
            });
            return data.place ? withCountry(data.place) : null;
        },
        async photos(placeId, hint) {
            const data = await invokePlaces<{ photos: string[] }>({
                op: 'photos',
                placeId,
                query: hint?.title,
                title: hint?.title,
                address: hint?.address,
                latitude: hint?.latitude,
                longitude: hint?.longitude,
            });
            return data.photos ?? [];
        },
    };
}

export function hintForPrediction(place: PlacePrediction): PlaceLookupHint {
    return hintFromPrediction(place);
}
