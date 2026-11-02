import {
    fetchGooglePlacePhotoReferences,
    fetchGooglePlacePredictions,
} from '@/lib/googlePlaces';
import { userMessageFromInvokeError } from '@/lib/paidEndpointError';
import { isBravePlaceId, isGooglePlaceId } from '@/lib/places/placeId';
import { mapGooglePhotoReferences, type PlacePhoto } from '@/lib/places/placePhotos';
import {
    readSessionPlacePhotos,
    rememberSessionPlacePhotos,
    type PlacePhotoLookup,
} from '@/lib/places/placePhotoSession';
import { parsePlacesProvider } from '@/lib/places/providerName';
import { supabase } from '@/lib/supabase';
import type { PlaceDetails } from '@/lib/places/types';

export interface PlacePhotoSource extends PlacePhotoLookup {
    id?: string;
}

interface ProxyDetails {
    place: (PlaceDetails & { placePhotos?: PlacePhoto[] }) | null;
}

export interface PlacePhotoLoader {
    googleReferences: (placeId: string) => Promise<string[]>;
    googlePlaceIdForTitle: (title: string) => Promise<string | null>;
    braveDetails: (lookup: PlacePhotoLookup) => Promise<ProxyDetails>;
    googleApiKey: () => string | undefined;
    provider: () => 'brave' | 'google';
}

function googleKey(): string | undefined {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    return key || undefined;
}

async function defaultBraveDetails(lookup: PlacePhotoLookup): Promise<ProxyDetails> {
    const { data, error } = await supabase.functions.invoke<ProxyDetails>('places-proxy', {
        body: {
            op: 'details',
            placeId: lookup.placeId?.trim() || undefined,
            query: lookup.title?.trim() || undefined,
            title: lookup.title?.trim() || undefined,
            latitude: lookup.latitude,
            longitude: lookup.longitude,
        },
    });
    if (error) throw new Error(await userMessageFromInvokeError(error, 'places'));
    if (!data) throw new Error('No response from place search.');
    return data;
}

function defaultLoader(): PlacePhotoLoader {
    return {
        googleReferences: (placeId) => fetchGooglePlacePhotoReferences(placeId, googleKey()),
        googlePlaceIdForTitle: async (title) => {
            const predictions = await fetchGooglePlacePredictions(title, googleKey());
            return predictions[0]?.place_id ?? null;
        },
        braveDetails: defaultBraveDetails,
        googleApiKey: googleKey,
        provider: () => parsePlacesProvider(process.env.EXPO_PUBLIC_PLACES_PROVIDER),
    };
}

function useGooglePhotos(lookup: PlacePhotoLookup, provider: 'brave' | 'google'): boolean {
    const placeId = lookup.placeId?.trim() ?? '';
    if (placeId && isGooglePlaceId(placeId)) return true;
    if (placeId && isBravePlaceId(placeId)) return false;
    return provider === 'google';
}

/**
 * Loads up to 5 place photos for an opened memory sheet.
 * Brave goes through places-proxy details. Google place ids use the photo URL helper.
 * Results are cached for the session by place id.
 */
export async function loadPlacePhotos(
    source: PlacePhotoSource | null | undefined,
    loader: PlacePhotoLoader = defaultLoader(),
): Promise<PlacePhoto[]> {
    if (!source) return [];
    const title = source.title?.trim() ?? '';
    const placeId = source.placeId?.trim() ?? '';
    if (!title && !placeId) return [];
    if (!Number.isFinite(source.latitude) || !Number.isFinite(source.longitude)) return [];

    const lookup: PlacePhotoLookup = {
        title,
        latitude: source.latitude,
        longitude: source.longitude,
        placeId,
    };
    const cached = readSessionPlacePhotos(lookup);
    if (cached) return cached;

    if (useGooglePhotos(lookup, loader.provider())) {
        const resolvedId = placeId && isGooglePlaceId(placeId)
            ? placeId
            : await loader.googlePlaceIdForTitle(title);
        if (!resolvedId) {
            rememberSessionPlacePhotos(placeId || `missing:${title}`, [], lookup);
            return [];
        }
        const photos = mapGooglePhotoReferences(
            await loader.googleReferences(resolvedId),
            loader.googleApiKey(),
        );
        rememberSessionPlacePhotos(resolvedId, photos, lookup);
        return photos;
    }

    const data = await loader.braveDetails(lookup);
    const photos = (data.place?.placePhotos ?? []).slice(0, 5);
    const resolvedId = data.place?.placeId?.trim() || placeId || `title:${title}`;
    rememberSessionPlacePhotos(resolvedId, photos, { ...lookup, placeId: resolvedId });
    return photos;
}
