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
