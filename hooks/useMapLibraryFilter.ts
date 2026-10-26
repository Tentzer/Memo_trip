import { UNKNOWN_COUNTRY_FOLDER } from '@/lib/countryFolder';
import { getCountryNameFromCoords } from '@/lib/geocoding';
import {
    filterOwnedMapMemories,
    filterSharedMapMemories,
    type MapLibraryFilter,
} from '@/lib/mapMemoryPins';
import type { CustomFolder, Memory } from '@/types/memory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

export type RelatedLibraryFilterOption = {
    id: string;
    name: string;
    memoCount: number;
    coverImageUrl?: string | null;
};

type MapLocation = {
    coords: {
        latitude: number;
        longitude: number;
    };
} | null;

type UseMapLibraryFilterArgs = {
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    customFolders: CustomFolder[];
    location: MapLocation;
    setShowMemories: (value: boolean) => void;
    setIsGalleryVisible: (value: boolean) => void;
    setIsCountryLibraryVisible: (value: boolean) => void;
    closeLibrariesOverlay: () => void;
};

export function useMapLibraryFilter({
    memories,
    sharedLibraryMemories,
    customFolders,
    location,
    setShowMemories,
    setIsGalleryVisible,
    setIsCountryLibraryVisible,
    closeLibrariesOverlay,
}: UseMapLibraryFilterArgs) {
    const [activeMapLibraryFilter, setActiveMapLibraryFilter] = useState<MapLibraryFilter | null>(null);
    const [isLibraryFilterVisible, setIsLibraryFilterVisible] = useState(false);
    const [selectedFilterLibraryIds, setSelectedFilterLibraryIds] = useState<string[]>([]);
    const [currentGpsCountry, setCurrentGpsCountry] = useState<string | null>(null);
    const [isFilterCountryLoading, setIsFilterCountryLoading] = useState(false);
    const filterCountryLookupRef = useRef<string | null>(null);

    const clearMapLibraryFilter = useCallback(() => {
        setActiveMapLibraryFilter(null);
        setSelectedFilterLibraryIds([]);
        setIsLibraryFilterVisible(false);
    }, []);

    const handleShowFolderOnMap = useCallback((folderId: string, folderType: 'country' | 'custom', folderName: string) => {
        if (folderType === 'country') {
            setActiveMapLibraryFilter({ mode: 'country', id: folderId, name: folderName });
        } else {
            setActiveMapLibraryFilter({ mode: 'custom', id: folderId, name: folderName });
        }
        setSelectedFilterLibraryIds(folderType === 'custom' ? [folderId] : []);
        setIsLibraryFilterVisible(false);
        setShowMemories(true);
        setIsGalleryVisible(false);
        setIsCountryLibraryVisible(false);
        closeLibrariesOverlay();
    }, [closeLibrariesOverlay, setIsCountryLibraryVisible, setIsGalleryVisible, setShowMemories]);

    useEffect(() => {
        if (!location) return;

        const { latitude, longitude } = location.coords;
        const lookupKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
        if (filterCountryLookupRef.current === lookupKey) return;

        filterCountryLookupRef.current = lookupKey;
        let isMounted = true;
        setIsFilterCountryLoading(true);

        getCountryNameFromCoords(latitude, longitude)
            .then((country) => {
                if (isMounted) {
                    setCurrentGpsCountry(country);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsFilterCountryLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [location]);

    const relatedLibraryFilterOptions = useMemo<RelatedLibraryFilterOption[]>(() => {
        if (!currentGpsCountry || currentGpsCountry === UNKNOWN_COUNTRY_FOLDER) return [];

        return customFolders
            // Your own country share mirror duplicates the country filter already on the map.
            .filter((folder) => !folder.countryShareOf || folder.isShared)
            .map((folder) => {
                const memoCount = [...memories, ...sharedLibraryMemories].filter((memory) =>
                    !memory.deletedAt &&
                    (memory.country || UNKNOWN_COUNTRY_FOLDER) === currentGpsCountry &&
                    (memory.customFolderIds ?? []).includes(folder.id)
                ).length;

                return {
                    id: folder.id,
                    name: folder.name,
                    memoCount,
                    coverImageUrl: folder.coverImageUrl,
                };
            })
            .filter((folder) => folder.memoCount > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [customFolders, currentGpsCountry, memories, sharedLibraryMemories]);

    const toggleFilterLibrary = useCallback((folderId: string) => {
        setSelectedFilterLibraryIds((prev) =>
            prev.includes(folderId)
                ? prev.filter((id) => id !== folderId)
                : [...prev, folderId]
        );
    }, []);

    const applyLibraryFilter = useCallback(() => {
        if (!currentGpsCountry || selectedFilterLibraryIds.length === 0) {
            clearMapLibraryFilter();
            return;
        }

        const selectedNames = relatedLibraryFilterOptions
            .filter((option) => selectedFilterLibraryIds.includes(option.id))
            .map((option) => option.name);

        setActiveMapLibraryFilter({
            mode: 'custom-multi',
            ids: selectedFilterLibraryIds,
            names: selectedNames,
            country: currentGpsCountry,
        });
        setShowMemories(true);
        setIsLibraryFilterVisible(false);
    }, [clearMapLibraryFilter, currentGpsCountry, relatedLibraryFilterOptions, selectedFilterLibraryIds, setShowMemories]);

    const toggleLibraryFilterPopover = useCallback(() => {
        Keyboard.dismiss();
        setSelectedFilterLibraryIds(() => {
            if (activeMapLibraryFilter?.mode === 'custom-multi') {
                return activeMapLibraryFilter.ids;
            }
            if (activeMapLibraryFilter?.mode === 'custom') {
                return [activeMapLibraryFilter.id];
            }
            return [];
        });
        setIsLibraryFilterVisible((prev) => !prev);
    }, [activeMapLibraryFilter]);

    const visibleOwnedMemories = useMemo(
        () => filterOwnedMapMemories(memories, activeMapLibraryFilter),
        [memories, activeMapLibraryFilter],
    );

    const visibleSharedMemories = useMemo(
        () => filterSharedMapMemories(sharedLibraryMemories, activeMapLibraryFilter),
        [sharedLibraryMemories, activeMapLibraryFilter],
    );

    return {
        activeMapLibraryFilter,
        isLibraryFilterVisible,
        setIsLibraryFilterVisible,
        selectedFilterLibraryIds,
        currentGpsCountry,
        isFilterCountryLoading,
        relatedLibraryFilterOptions,
        visibleOwnedMemories,
        visibleSharedMemories,
        clearMapLibraryFilter,
        handleShowFolderOnMap,
        toggleFilterLibrary,
        applyLibraryFilter,
        toggleLibraryFilterPopover,
    };
}
