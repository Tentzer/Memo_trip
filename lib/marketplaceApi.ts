import { supabase } from '@/lib/supabase';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { CustomFolder, Memory } from '@/types/memory';

export interface MarketLibrary {
    id: string;
    sourceLibraryId: string;
    authorId: string;
    name: string;
    description?: string;
    coverImageUrl?: string | null;
    country?: string;
    photoCount: number;
    downloadCount: number;
    createdAt: string;
    publishedAt: string;
}

export interface MarketPhoto {
    id: string;
    marketLibraryId: string;
    sourceMemoryId: string;
    imageUrl: string;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
    country?: string;
    sortOrder: number;
    createdAt: string;
}

export interface MarketLibraryDetails {
    library: MarketLibrary;
    photos: MarketPhoto[];
}

export interface ListMarketLibrariesOptions {
    country?: string;
    limit?: number;
}

export interface PublishLibraryToMarketParams {
    userId: string;
    library: CustomFolder;
    memories: Memory[];
    description?: string;
    country?: string;
    coverImageUrl?: string | null;
}

export interface MarketplaceResult<T> {
    data: T | null;
    error: string | null;
}

function mapMarketLibrary(row: any): MarketLibrary {
    return {
        id: String(row.id),
        sourceLibraryId: row.source_library_id != null ? String(row.source_library_id) : '',
        authorId: row.author_id,
        name: row.name,
        description: row.description ?? undefined,
        coverImageUrl: row.cover_image_url ?? null,
        country: row.country ?? undefined,
        photoCount: row.photo_count ?? 0,
        downloadCount: row.download_count ?? 0,
        createdAt: row.created_at ?? new Date().toISOString(),
        publishedAt: row.published_at ?? row.created_at ?? new Date().toISOString(),
    };
}

function mapMarketPhoto(row: any): MarketPhoto {
    return {
        id: String(row.id),
        marketLibraryId: String(row.market_library_id),
        sourceMemoryId: row.source_memory_id != null ? String(row.source_memory_id) : '',
        imageUrl: row.image_url,
        latitude: row.latitude,
        longitude: row.longitude,
        title: row.title ?? undefined,
        description: row.description ?? undefined,
        country: row.country ?? undefined,
        sortOrder: row.sort_order ?? 0,
        createdAt: row.created_at ?? new Date().toISOString(),
    };
}

export async function listMarketLibraries(
    options: ListMarketLibrariesOptions = {}
): Promise<MarketplaceResult<MarketLibrary[]>> {
    let query = supabase
        .from('market_libraries')
        .select('*')
        .order('download_count', { ascending: false })
        .order('photo_count', { ascending: false })
        .order('published_at', { ascending: false });

    if (options.country?.trim()) {
        query = query.eq('country', options.country.trim());
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: (data ?? []).map(mapMarketLibrary), error: null };
}

export async function getMarketLibraryDetails(marketLibraryId: string): Promise<MarketplaceResult<MarketLibraryDetails>> {
    const [{ data: libraryRow, error: libraryError }, { data: photoRows, error: photosError }] = await Promise.all([
        supabase
            .from('market_libraries')
            .select('*')
            .eq('id', marketLibraryId)
            .maybeSingle(),
        supabase
            .from('market_photos')
            .select('*')
            .eq('market_library_id', marketLibraryId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
    ]);

    if (libraryError || photosError) {
        return { data: null, error: libraryError?.message ?? photosError?.message ?? 'Could not load library.' };
    }

    if (!libraryRow) {
        return { data: null, error: 'Marketplace library not found.' };
    }

    return {
        data: {
            library: mapMarketLibrary(libraryRow),
            photos: (photoRows ?? []).map(mapMarketPhoto),
        },
        error: null,
    };
}

export async function publishLibraryToMarket({userId,library,memories,description,country,coverImageUrl,}: PublishLibraryToMarketParams): Promise<MarketplaceResult<MarketLibrary>> {
    const publishableMemories = memories.filter(memory => !memory.deletedAt);

    if (!userId) {
        return { data: null, error: 'You need to be logged in to publish a library.' };
    }

    if (library.role !== 'owner' || library.owner_id !== userId) {
        return { data: null, error: 'Only the owner can publish this library.' };
    }

    if (publishableMemories.length === 0) {
        return { data: null, error: 'Add at least one memo before publishing this library.' };
    }

    const hasUntitledMemo = publishableMemories.some(memory => !memory.title?.trim());
    if (hasUntitledMemo) {
        return { data: null, error: 'Every memo needs a title before publishing this library.' };
    }

    const listingCover = coverImageUrl ?? library.coverImageUrl ?? publishableMemories[0]?.uri ?? null;
    const listingCountry = country?.trim() || publishableMemories[0]?.country || null;

    const { data: insertedLibrary, error: libraryError } = await supabase
        .from('market_libraries')
        .insert([{
            source_library_id: library.id,
            author_id: userId,
            name: library.name,
            description: description?.trim() || null,
            cover_image_url: listingCover,
            country: listingCountry,
            photo_count: publishableMemories.length,
        }])
        .select('*')
        .single();

    if (libraryError || !insertedLibrary) {
        return { data: null, error: libraryError?.message ?? 'Could not publish library.' };
    }

    const marketLibraryId = insertedLibrary.id.toString();
    const photoRows = publishableMemories.map((memory, index) => ({
        market_library_id: marketLibraryId,
        source_memory_id: memory.id,
        image_url: memory.uri,
        latitude: memory.latitude,
        longitude: memory.longitude,
        title: memory.title?.trim() || null,
        description: memory.description?.trim() || null,
        country: memory.country ?? listingCountry,
        sort_order: index,
    }));

    const { error: photosError } = await supabase.from('market_photos').insert(photoRows);

    if (photosError) {
        await supabase.from('market_libraries').delete().eq('id', marketLibraryId);
        return { data: null, error: photosError.message };
    }

    return { data: mapMarketLibrary(insertedLibrary), error: null };
}

async function listActiveMarketLibraryDownloadIds(): Promise<MarketplaceResult<string[]>> {
    const { data, error } = await supabase
        .from('market_library_downloads')
        .select('market_library_id, downloaded_library_id');

    if (error) {
        return { data: null, error: error.message };
    }

    const rows = (data ?? []).filter(
        (row) => row.market_library_id != null && row.downloaded_library_id != null,
    );

    if (rows.length === 0) {
        return { data: [], error: null };
    }

    const copiedLibraryIds = rows.map(row => String(row.downloaded_library_id));
    const { data: existingLibraries, error: librariesError } = await supabase
        .from('libraries')
        .select('id')
        .in('id', copiedLibraryIds);

    if (librariesError) {
        return { data: null, error: librariesError.message };
    }

    const activeLibraryIds = new Set(
        (existingLibraries ?? []).map(row => String(row.id)),
    );

    return {
        data: rows
            .filter(row => activeLibraryIds.has(String(row.downloaded_library_id)))
            .map(row => String(row.market_library_id)),
        error: null,
    };
}

/** Market listings the user still has a copied library for (blocks re-download in UI). */
export async function listDownloadedMarketLibraryIds(): Promise<MarketplaceResult<string[]>> {
    return listActiveMarketLibraryDownloadIds();
}

/**
 * Removes stale download rows (including null downloaded_library_id) so the
 * download_market_library RPC can insert again after the user deleted their copy.
 */
export async function clearMarketLibraryDownloadRecords(
    marketLibraryId: string,
): Promise<MarketplaceResult<void>> {
    const { error } = await supabase
        .from('market_library_downloads')
        .delete()
        .eq('market_library_id', marketLibraryId);

    if (error) {
        return { data: null, error: error.message };
    }

    return { data: undefined, error: null };
}

/** Clears all download history for a listing when the user deletes their copied library. */
export async function revokeMarketLibraryDownload(
    downloadedLibraryId: string,
): Promise<MarketplaceResult<void>> {
    const { data: row, error: selectError } = await supabase
        .from('market_library_downloads')
        .select('market_library_id')
        .eq('downloaded_library_id', downloadedLibraryId)
        .not('market_library_id', 'is', null)
        .limit(1)
        .maybeSingle();

    if (selectError) {
        return { data: null, error: selectError.message };
    }

    if (!row?.market_library_id) {
        const { error } = await supabase
            .from('market_library_downloads')
            .delete()
            .eq('downloaded_library_id', downloadedLibraryId);

        if (error) {
            return { data: null, error: error.message };
        }
        return { data: undefined, error: null };
    }

    return clearMarketLibraryDownloadRecords(String(row.market_library_id));
}

const ALREADY_DOWNLOADED_MESSAGE = 'You have already downloaded this marketplace library.';

export async function downloadMarketLibrary(marketLibraryId: string): Promise<MarketplaceResult<string>> {
    const runDownload = async () => supabase.rpc('download_market_library', {
        p_market_library_id: marketLibraryId,
    });

    let { data, error } = await runDownload();

    if (error?.message?.includes(ALREADY_DOWNLOADED_MESSAGE)) {
        const cleared = await clearMarketLibraryDownloadRecords(marketLibraryId);
        if (cleared.error) {
            return { data: null, error: cleared.error };
        }
        ({ data, error } = await runDownload());
    }

    if (error) {
        return { data: null, error: error.message };
    }

    if (!data) {
        return { data: null, error: 'Download did not return a library id.' };
    }

    return { data: String(data), error: null };
}

export async function excludeLibraryMemosFromCountryFolders(
    userId: string,
    libraryId: string
): Promise<MarketplaceResult<void>> {
    const { data, error } = await supabase
        .from('library_memos')
        .select('memo_id')
        .eq('library_id', libraryId);

    if (error) {
        return { data: null, error: error.message };
    }

    const memoIds = (data ?? []).map(row => row.memo_id.toString());
    if (memoIds.length === 0) {
        return { data: undefined, error: null };
    }

    const storedMeta = await loadMemoryMeta(userId);
    const nextMeta = { ...storedMeta };

    memoIds.forEach(memoId => {
        const existingMeta = nextMeta[memoId] ?? { customFolderIds: [] };
        const customFolderIds = existingMeta.customFolderIds.includes(libraryId)
            ? existingMeta.customFolderIds
            : [...existingMeta.customFolderIds, libraryId];

        nextMeta[memoId] = {
            ...existingMeta,
            customFolderIds,
            excludeFromCountryFolder: true,
        };
    });

    await saveMemoryMeta(userId, nextMeta);
    return { data: undefined, error: null };
}
