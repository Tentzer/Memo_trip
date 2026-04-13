export interface Memory {
    id: string;
    uri: string;
    latitude: number;
    longitude: number;
    created_at: string;
    owner_id?: string;
    isShared?: boolean;
    country?: string;
    title?: string;
    description?: string;
    customFolderIds: string[];
    excludeFromCountryFolder?: boolean;
}

export interface CustomFolder {
    id: string;
    name: string;
    created_at: string;
    owner_id: string;
    role: 'owner' | 'viewer';
    isShared: boolean;
}

export type MemoryMeta = Pick<Memory, 'country' | 'title' | 'description' | 'customFolderIds' | 'excludeFromCountryFolder'>;
