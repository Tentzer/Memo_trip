import {
    downloadMarketLibrary,
    excludeLibraryMemosFromCountryFolders,
    getMarketLibraryDetails,
    listDownloadedMarketLibraryIds,
    listMarketLibraries,
    MarketLibrary,
    MarketLibraryDetails,
    MarketplaceResult,
    publishLibraryToMarket,
} from '@/lib/marketplaceApi';
import { CustomFolder, Memory } from '@/types/memory';
import { useCallback, useMemo, useState } from 'react';

interface Params {
    userId?: string;
    customFolders: CustomFolder[];
    memories: Memory[];
    reloadMemories: () => Promise<void>;
}

function getUnavailableMarketLibraryIds(
    libraries: MarketLibrary[],
    downloadedIds: string[],
    userId?: string
): string[] {
    const ids = new Set(downloadedIds);
    if (userId) {
        libraries.forEach(library => {
            if (library.authorId === userId) {
                ids.add(library.id);
            }
        });
    }
    return Array.from(ids);
}

export function useMarketplace({ userId, customFolders, memories, reloadMemories }: Params) {
    const [marketLibraries, setMarketLibraries] = useState<MarketLibrary[]>([]);
    const [selectedDetails, setSelectedDetails] = useState<MarketLibraryDetails | null>(null);
    const [countryFilter, setCountryFilter] = useState<string | undefined>();
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [publishingLibraryId, setPublishingLibraryId] = useState<string | null>(null);
    const [downloadingLibraryId, setDownloadingLibraryId] = useState<string | null>(null);
    const [downloadedMarketLibraryIds, setDownloadedMarketLibraryIds] = useState<string[]>([]);

    const ownedCustomFolders = useMemo(
        () => customFolders.filter(folder => folder.role === 'owner' && folder.owner_id === userId),
        [customFolders, userId]
    );

    const getLibraryMemories = useCallback(
        (libraryId: string) => memories.filter(memory => !memory.deletedAt && memory.customFolderIds.includes(libraryId)),
        [memories]
    );

    const loadMarketLibraries = useCallback(async (nextCountryFilter?: string): Promise<MarketplaceResult<MarketLibrary[]>> => {
        setIsLoading(true);
        const [result, downloadedResult] = await Promise.all([
            listMarketLibraries({ country: nextCountryFilter }),
            userId ? listDownloadedMarketLibraryIds() : Promise.resolve({ data: [], error: null }),
        ]);
        if (result.data) {
            setMarketLibraries(result.data);
        }
        if (downloadedResult.data) {
            setDownloadedMarketLibraryIds(getUnavailableMarketLibraryIds(result.data ?? [], downloadedResult.data, userId));
        }
        setIsLoading(false);
        return result;
    }, [userId]);

    const refreshMarketLibraries = useCallback(async (): Promise<MarketplaceResult<MarketLibrary[]>> => {
        setIsRefreshing(true);
        const [result, downloadedResult] = await Promise.all([
            listMarketLibraries({ country: countryFilter }),
            userId ? listDownloadedMarketLibraryIds() : Promise.resolve({ data: [], error: null }),
        ]);
        if (result.data) {
            setMarketLibraries(result.data);
        }
        if (downloadedResult.data) {
            setDownloadedMarketLibraryIds(getUnavailableMarketLibraryIds(result.data ?? [], downloadedResult.data, userId));
        }
        setIsRefreshing(false);
        return result;
    }, [countryFilter, userId]);

    const applyCountryFilter = useCallback(async (country?: string): Promise<MarketplaceResult<MarketLibrary[]>> => {
        const normalizedCountry = country?.trim() || undefined;
        setCountryFilter(normalizedCountry);
        return loadMarketLibraries(normalizedCountry);
    }, [loadMarketLibraries]);

    const openMarketLibrary = useCallback(async (marketLibraryId: string): Promise<MarketplaceResult<MarketLibraryDetails>> => {
        setIsLoadingDetails(true);
        const result = await getMarketLibraryDetails(marketLibraryId);
        if (result.data) {
            setSelectedDetails(result.data);
        }
        setIsLoadingDetails(false);
        return result;
    }, []);

    const closeMarketLibrary = useCallback(() => {
        setSelectedDetails(null);
    }, []);

    const publishLibrary = useCallback(async (
        libraryId: string,
        description?: string
    ): Promise<MarketplaceResult<MarketLibrary>> => {
        if (!userId) {
            return { data: null, error: 'You need to be logged in to publish a library.' };
        }

        const library = ownedCustomFolders.find(folder => folder.id === libraryId);
        if (!library) {
            return { data: null, error: 'Only libraries you own can be published.' };
        }

        setPublishingLibraryId(libraryId);
        const result = await publishLibraryToMarket({
            userId,
            library,
            memories: getLibraryMemories(libraryId),
            description,
        });

        if (result.data) {
            await refreshMarketLibraries();
        }

        setPublishingLibraryId(null);
        return result;
    }, [getLibraryMemories, ownedCustomFolders, refreshMarketLibraries, userId]);

    const downloadLibrary = useCallback(async (marketLibraryId: string): Promise<MarketplaceResult<string>> => {
        if (!userId) {
            return { data: null, error: 'You need to be logged in to download a library.' };
        }

        const marketLibrary = selectedDetails?.library.id === marketLibraryId
            ? selectedDetails.library
            : marketLibraries.find(library => library.id === marketLibraryId);
        if (marketLibrary?.authorId === userId) {
            return { data: null, error: 'You cannot download your own marketplace library.' };
        }

        if (downloadedMarketLibraryIds.includes(marketLibraryId)) {
            return { data: null, error: 'You have already downloaded this marketplace library.' };
        }

        setDownloadingLibraryId(marketLibraryId);
        const result = await downloadMarketLibrary(marketLibraryId);

        if (result.data) {
            const exclusionResult = await excludeLibraryMemosFromCountryFolders(userId, result.data);
            if (exclusionResult.error) {
                setDownloadingLibraryId(null);
                return { data: null, error: exclusionResult.error };
            }

            await reloadMemories();
            setDownloadedMarketLibraryIds(prev => prev.includes(marketLibraryId) ? prev : [...prev, marketLibraryId]);
            setSelectedDetails(prev => {
                if (!prev || prev.library.id !== marketLibraryId) return prev;
                return {
                    ...prev,
                    library: {
                        ...prev.library,
                        downloadCount: prev.library.downloadCount + 1,
                    },
                };
            });
            await refreshMarketLibraries();
        }

        setDownloadingLibraryId(null);
        return result;
    }, [downloadedMarketLibraryIds, marketLibraries, refreshMarketLibraries, reloadMemories, selectedDetails, userId]);

    return {
        marketLibraries,
        selectedDetails,
        countryFilter,
        isLoading,
        isRefreshing,
        isLoadingDetails,
        publishingLibraryId,
        downloadingLibraryId,
        downloadedMarketLibraryIds,
        ownedCustomFolders,
        getLibraryMemories,
        loadMarketLibraries,
        refreshMarketLibraries,
        applyCountryFilter,
        openMarketLibrary,
        closeMarketLibrary,
        publishLibrary,
        downloadLibrary,
    };
}
