import type { MemoryPlaceCategory } from '../../types/memory.ts';

import { mapBravePlaceCategory } from './placeCategorySignals.ts';
import { syntheticBravePlaceId } from './placeId.ts';
import { mapBravePlacePhotos, type PlacePhoto } from './placePhotos.ts';

export interface BraveDayHours {
    abbr_name?: string;
    full_name?: string;
    opens?: string;
    closes?: string;
}

export interface BravePlaceResult {
    id?: string;
    title?: string;
    url?: string;
    description?: string;
    coordinates?: number[];
    thumbnail?: { src?: string; original?: string };
    postal_address?: { displayAddress?: string };
    opening_hours?: {
        current_day?: BraveDayHours[];
        days?: BraveDayHours[][];
    };
    contact?: { telephone?: string };
    rating?: { ratingValue?: number; bestRating?: number; reviewCount?: number };
    pictures?: { results?: { src?: string; original?: string; logo?: boolean; duplicated?: boolean }[] };
    categories?: string[];
    icon_category?: string;
    serves_cuisine?: string[];
}

export interface MappedBravePlace {
    placeId: string;
    name: string;
    /** Dropdown line: "Name, address". */
    description: string;
    /** Brave short type, such as "Sushi Restaurant". */
    typeLabel: string;
    address: string;
    latitude: number;
    longitude: number;
    category?: MemoryPlaceCategory;
    rating: number;
    reviewCount: number;
    phone?: string;
    website?: string;
    hours?: string;
    photoUrls: string[];
    placePhotos: PlacePhoto[];
}

export interface BraveSearchInput {
    query?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    count?: number;
}

/**
 * Brave Suggest (`/res/v1/suggest/search`) completes search queries, not places.
 * `/res/v1/local/pois` looks up temporary web-search location ids (about 8 hours),
 * not a durable place-details API. Place Search `id` is the id we store. When a
 * later lookup has no snapshot, search again by title near the saved coordinates.
 */
export function bravePlaceSearchUrl(input: BraveSearchInput): string {
    const params = new URLSearchParams();
    const query = input.query?.trim() ?? '';
    if (query) params.set('q', query);
    if (input.latitude != null && Number.isFinite(input.latitude)) {
        params.set('latitude', String(input.latitude));
    }
    if (input.longitude != null && Number.isFinite(input.longitude)) {
        params.set('longitude', String(input.longitude));
    }
    if (input.radiusMeters != null && Number.isFinite(input.radiusMeters) && input.radiusMeters > 0) {
        params.set('radius', String(Math.round(input.radiusMeters)));
    }
    const count = input.count ?? 20;
    params.set('count', String(Math.min(100, Math.max(1, Math.round(count)))));
    return `https://api.search.brave.com/res/v1/local/place_search?${params}`;
}

function formatHours(hours: BravePlaceResult['opening_hours']): string | undefined {
    const today = hours?.current_day?.filter((slot) => slot.opens || slot.closes) ?? [];
    if (!today.length) return undefined;
    const label = today[0]?.full_name?.trim() || today[0]?.abbr_name?.trim() || '';
    const ranges = today
        .map((slot) => [slot.opens, slot.closes].filter(Boolean).join('-'))
        .filter(Boolean)
        .join(', ');
    if (!ranges) return undefined;
    return label ? `${label}: ${ranges}` : ranges;
}

function bravePlacePhotos(result: BravePlaceResult): PlacePhoto[] {
    const fromPictures = mapBravePlacePhotos(result.pictures?.results);
    if (fromPictures.length) return fromPictures;
    const thumb = result.thumbnail?.src?.trim() ?? '';
    const full = result.thumbnail?.original?.trim() || thumb;
    if (!thumb || !full) return [];
    return [{ thumb, full }];
}

function photoUrls(result: BravePlaceResult): string[] {
    const fromPictures = (result.pictures?.results ?? [])
        .filter((picture) => picture.src && !picture.logo && !picture.duplicated)
        .map((picture) => picture.src as string);
    if (fromPictures.length) return fromPictures;
    const thumb = result.thumbnail?.original || result.thumbnail?.src;
    return thumb ? [thumb] : [];
}

function finiteCoordinate(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function ratingOutOfFive(rating: BravePlaceResult['rating']): { value: number; count: number } {
    const count = typeof rating?.reviewCount === 'number' && rating.reviewCount > 0
        ? Math.round(rating.reviewCount)
        : 0;
    const raw = rating?.ratingValue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return { value: 0, count };
    const best = rating?.bestRating;
    if (typeof best === 'number' && best > 0 && best !== 5) {
        return { value: (raw / best) * 5, count };
    }
    return { value: raw, count };
}

export function mapBravePlace(result: BravePlaceResult): MappedBravePlace | null {
    const name = result.title?.trim() ?? '';
    const coordinates = result.coordinates;
    const latitude = finiteCoordinate(coordinates?.[0]);
    const longitude = finiteCoordinate(coordinates?.[1]);
    if (!name || latitude == null || longitude == null) return null;

    const address = result.postal_address?.displayAddress?.trim() ?? '';
    const typeLabel = result.description?.trim() ?? '';
    const phone = result.contact?.telephone?.trim() || undefined;
    const website = result.url?.trim() || undefined;
    const { value, count } = ratingOutOfFive(result.rating);
    const placeId = result.id?.trim()
        || syntheticBravePlaceId(name, latitude, longitude, address);

    return {
        placeId,
        name,
        description: address ? `${name}, ${address}` : name,
        typeLabel,
        address,
        latitude,
        longitude,
        category: mapBravePlaceCategory({
            name,
            description: typeLabel,
            servesCuisine: result.serves_cuisine,
            categories: result.categories,
            iconCategory: result.icon_category,
        }),
        rating: value,
        reviewCount: count,
        phone,
        website,
        hours: formatHours(result.opening_hours),
        photoUrls: photoUrls(result),
        placePhotos: bravePlacePhotos(result),
    };
}

export function mapBraveSearchResponse(body: unknown): MappedBravePlace[] {
    const results = (body as { results?: unknown } | null)?.results;
    if (!Array.isArray(results)) return [];
    return results
        .map((result) => mapBravePlace(result as BravePlaceResult))
        .filter((place): place is MappedBravePlace => place !== null);
}

export function predictionFromBravePlace(place: MappedBravePlace) {
    return {
        place_id: place.placeId,
        description: place.description,
        structured_formatting: {
            main_text: place.name,
            secondary_text: place.address || place.typeLabel,
        },
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        category: place.category,
        rating: place.rating,
        reviewCount: place.reviewCount,
        phone: place.phone,
        website: place.website,
        hours: place.hours,
        placePhotos: place.placePhotos,
    };
}
