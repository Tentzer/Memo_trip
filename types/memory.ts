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
}

export type MemoryMeta = Pick<Memory, 'country' | 'title' | 'description' | 'customFolderIds' | 'excludeFromCountryFolder' | 'source' | 'sourceUrl'>;
