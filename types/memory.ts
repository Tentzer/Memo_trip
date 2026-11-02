export type MemoryPlaceCategory =
    | 'restaurant'
    | 'pasta'
    | 'ramen'
    | 'sushi'
    | 'cafe'
    | 'bar'
    | 'bakery'
    | 'attraction'
    | 'shopping'
    | 'other';

export interface Memory {
    id: string;
    uri: string;
    /** Public URL of a ~200px JPEG for map pins. Pins fall back to `uri` when this is missing. */
    thumb_uri?: string | null;
    latitude: number;
    longitude: number;
    created_at: string;
    deletedAt?: string | null;
    owner_id?: string;
    isShared?: boolean;
    country?: string;
    title?: string;
    description?: string;
    placeCategory?: MemoryPlaceCategory;
    customFolderIds: string[];
    excludeFromCountryFolder?: boolean;
    source?: 'video_import';
    sourceUrl?: string;
    /** Brave `loc…` id or a Google place id, when this memo was saved from search. */
    placeId?: string;
}

export interface CustomFolder {
    id: string;
    name: string;
    created_at: string;
    owner_id: string;
    role: 'owner' | 'viewer' | 'editor';
    isShared: boolean;
    coverImageUrl?: string | null;
    /** Set on managed mirrors of a country folder; holds the country name. */
    countryShareOf?: string | null;
}

export type MemoryMeta = Pick<
    Memory,
    | 'country'
    | 'title'
    | 'description'
    | 'placeCategory'
    | 'customFolderIds'
    | 'excludeFromCountryFolder'
    | 'source'
    | 'sourceUrl'
>;
