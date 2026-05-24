import {
    displayMarketplaceCountry,
    isUnknownCountry,
    resolveMarketplaceCountry,
} from '@/lib/marketplaceCountry';
import { supabase } from '@/lib/supabase';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { CustomFolder, Memory } from '@/types/memory';

export interface MarketLibrary {
    id: string;
    sourceLibraryId: string;
    authorId: string;
    authorUsername?: string;
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

async function attachAuthorUsernames(
    libraries: MarketLibrary[],
): Promise<MarketplaceResult<MarketLibrary[]>> {
    const authorIds = [...new Set(libraries.map(library => library.authorId).filter(Boolean))];
    if (authorIds.length === 0) {
        return { data: libraries, error: null };
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', authorIds);

    if (error) {
        return { data: null, error: error.message };
    }

    const usernameById = new Map<string, string>();
    (data ?? []).forEach((row: { id: string; username?: string | null }) => {
        const trimmed = row.username?.trim();
        if (trimmed) {
            usernameById.set(row.id, trimmed);
        }
    });

    return {
        data: libraries.map(library => ({
            ...library,
            authorUsername: usernameById.get(library.authorId),
        })),
        error: null,
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

async function enrichLibrariesWithResolvedCountry(
    libraries: MarketLibrary[],
): Promise<MarketLibrary[]> {
    if (libraries.length === 0) {
        return libraries;
    }

    const libraryIds = libraries.map((library) => library.id);
    const { data: photoRows, error } = await supabase
        .from('market_photos')
        .select('market_library_id, country')
        .in('market_library_id', libraryIds);

    if (error) {
        console.warn('Could not load marketplace photo countries:', error.message);
        return libraries.map((library) => ({
            ...library,
            country: displayMarketplaceCountry(library.country, []),
        }));
    }

    const photosByLibraryId = new Map<string, { country?: string | null }[]>();
    for (const row of photoRows ?? []) {
        const libraryId = String(row.market_library_id);
        const existing = photosByLibraryId.get(libraryId) ?? [];
        existing.push({ country: row.country });
        photosByLibraryId.set(libraryId, existing);
    }

    return libraries.map((library) => {
        const photos = photosByLibraryId.get(library.id) ?? [];
        const resolvedCountry = displayMarketplaceCountry(library.country, photos);
        return resolvedCountry ? { ...library, country: resolvedCountry } : library;
    });
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

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        return { data: null, error: error.message };
    }

    const mapped = (data ?? []).map(mapMarketLibrary);
    const enriched = await enrichLibrariesWithResolvedCountry(mapped);
    const countryFilter = options.country?.trim();
    const filtered = countryFilter
        ? enriched.filter(
            (library) => library.country?.trim().toLowerCase() === countryFilter.toLowerCase(),
        )
        : enriched;

    return attachAuthorUsernames(filtered);
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

    const photos = (photoRows ?? []).map(mapMarketPhoto);
    const enriched = await attachAuthorUsernames([mapMarketLibrary(libraryRow)]);
    if (enriched.error || !enriched.data?.[0]) {
        return { data: null, error: enriched.error ?? 'Could not load library author.' };
    }

    const library = enriched.data[0];
    const resolvedCountry = displayMarketplaceCountry(library.country, photos);

    return {
        data: {
            library: resolvedCountry ? { ...library, country: resolvedCountry } : library,
            photos,
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

    const countryResult = resolveMarketplaceCountry(publishableMemories);
    if (!countryResult.ok) {
        return { data: null, error: countryResult.error };
    }

    const listingCover = coverImageUrl ?? library.coverImageUrl ?? publishableMemories[0]?.uri ?? null;
    const listingCountry = country?.trim() || countryResult.country;

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
        country: isUnknownCountry(memory.country) ? listingCountry : memory.country,
        sort_order: index,
    }));

    const { error: photosError } = await supabase.from('market_photos').insert(photoRows);

    if (photosError) {
        await supabase.from('market_libraries').delete().eq('id', marketLibraryId);
        return { data: null, error: photosError.message };
    }

    const enriched = await attachAuthorUsernames([mapMarketLibrary(insertedLibrary)]);
    if (enriched.error || !enriched.data?.[0]) {
        return { data: null, error: enriched.error ?? 'Could not load library author.' };
    }

    return { data: enriched.data[0], error: null };
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
