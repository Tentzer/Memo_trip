import type { MemoryPlaceCategory } from '@/types/memory';

export interface PlacePrediction {
    place_id: string;
    description: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
    latitude?: number;
    longitude?: number;
    address?: string;
    category?: MemoryPlaceCategory;
    rating?: number;
    reviewCount?: number;
    phone?: string;
    website?: string;
    hours?: string;
}

export interface PlaceDetails {
    latitude: number;
    longitude: number;
    /** Google photo_reference, or a direct image URL after the place sheet asks for photos. */
    photoReference: string | null;
    country: string | null;
    title: string;
    address?: string;
    category?: MemoryPlaceCategory;
    rating?: number;
    reviewCount?: number;
    phone?: string;
    website?: string;
    hours?: string;
    placeId?: string;
}

export interface PlaceBias {
    latitude: number;
    longitude: number;
}

export interface PlaceLookupHint {
    title?: string;
    description?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    category?: MemoryPlaceCategory;
    rating?: number;
    reviewCount?: number;
    phone?: string;
    website?: string;
    hours?: string;
}

export interface PlacesClient {
    search(query: string, bias?: PlaceBias): Promise<PlacePrediction[]>;
    nearby(query: string, bias: PlaceBias, radiusMeters?: number): Promise<PlacePrediction[]>;
    details(placeId: string, hint?: PlaceLookupHint): Promise<PlaceDetails | null>;
    photos(placeId: string, hint?: PlaceLookupHint): Promise<string[]>;
}
