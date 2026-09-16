import InvitesModal from '@/components/InvitesModal';
import LibraryModal from '@/components/LibraryModal';
import MarketPlaceModal from '@/components/MarketPlaceModal';
import MemoActionsSheet from '@/components/MemoActionsSheet';
import { MemoriesMapLoadOverlay } from '@/components/MemoriesMapLoadOverlay';
import MemoInfoModal from '@/components/MemoInfoModal';
import PlaceDescriptionModal from '@/components/PlaceDescriptionModal';
import SearchBar, { SEARCH_BAR_ROW_HEIGHT_PX } from '@/components/SearchBar';
import SettingsSheet, { type SettingsSheetRef } from '@/components/SettingsSheet';
import ShareMemoryModal from '@/components/ShareMemoryModal';
import { darkMapStyle } from '@/constants/darkMapStyle';
import { useAuth } from '@/context/AuthContext';
import { useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { type Memory, useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useMapLogic } from '@/hooks/useMapLogic';
import { getCountryNameFromCoords } from '@/lib/geocoding';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isValidMapCoordinate(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        !(lat === 0 && lng === 0)
    );
}

type MapMemoryMarkerProps = {
    memory: Memory;
    variant: 'owned' | 'shared';
    onMarkerPress: (memory: Memory) => void;
};

const IG_GRADIENT = ['#f9ce34', '#ee2a7b', '#6228d7'] as const;
const UNKNOWN_LOCATION = 'Unknown Location';

type MapLibraryFilter =
    | { mode: 'country'; id: string; name: string }
    | { mode: 'custom'; id: string; name: string }
    | { mode: 'custom-multi'; ids: string[]; names: string[]; country: string };

type RelatedLibraryFilterOption = {
    id: string;
    name: string;
    memoCount: number;
    coverImageUrl?: string | null;
};

const MapMemoryMarker = React.memo(function MapMemoryMarker({
    memory,
    variant,
    onMarkerPress,
}: MapMemoryMarkerProps) {
    const { theme } = useAppTheme();
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const isVideoImport = memory.source === 'video_import';
    const accentColor = isVideoImport ? '#ee2a7b' : variant === 'owned' ? '#1d4ed8' : '#2563eb';

    const onImageSettle = useCallback(() => setTracksViewChanges(false), []);

    const image = (
        <ExpoImage
            source={{ uri: memory.uri }}
            style={styles.markerAvatarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoad={onImageSettle}
            onError={onImageSettle}
        />
    );

    const ring = isVideoImport ? (
        <LinearGradient
            colors={IG_GRADIENT}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.markerAccentRing}
        >
            <View style={styles.markerGradientInner}>
                {image}
            </View>
        </LinearGradient>
    ) : (
        <View style={[styles.markerAccentRing, { borderColor: accentColor }]}>
            {image}
        </View>
    );

    return (
        <Marker
            identifier={memory.id}
            coordinate={{
                latitude: memory.latitude,
                longitude: memory.longitude,
            }}
            zIndex={999}
            onPress={(event) => {
                event.stopPropagation?.();
                onMarkerPress(memory);
            }}
            tracksViewChanges={tracksViewChanges}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: 0 }}
        >
            <View
                style={styles.markerPinWrapper}
                collapsable={false}
            >
                <View
                    style={[
                        styles.markerContainer,
                        styles.markerAvatarOuter,
                        {
                            borderColor: variant === 'shared' ? '#7c3aed' : 'transparent',
                            borderWidth: variant === 'shared' ? 3 : 0,
                            backgroundColor: variant === 'shared' ? theme.colors.surface : 'transparent',
                            width: variant === 'shared' ? 68 : 58,
                            height: variant === 'shared' ? 68 : 58,
                            borderRadius: variant === 'shared' ? 34 : 29,
                        },
                    ]}
                >
                    {ring}
                </View>
                <View style={[styles.markerStem, { backgroundColor: accentColor }]} />
            </View>
        </Marker>
    );
}, (prev: MapMemoryMarkerProps, next: MapMemoryMarkerProps) =>
    prev.variant === next.variant &&
    prev.onMarkerPress === next.onMarkerPress &&
    prev.memory.id === next.memory.id &&
    prev.memory.uri === next.memory.uri &&
    prev.memory.latitude === next.memory.latitude &&
    prev.memory.longitude === next.memory.longitude &&
    prev.memory.source === next.memory.source
);

export default function MapScreen() {
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();
    const router = useRouter();
    const auth = useAuth();
    const { isDarkMode, setIsDarkMode, theme } = useAppTheme();
    /** Match `components/SearchBar.tsx` top offset below safe area. */
    const mapChromeTop = insets.top + 16;
    const menuBelowSearchGap = 10;

    const {
        memories,
        sharedLibraryMemories,
        customFolders,
        deleteMemory,
        addPlaceMemory,
        handleShareSubmit,
        shareCustomFolder,
        shareCountryFolder,
        grantLibraryEditAccess,
        removeLibrary,
        createCustomFolder,
        toggleMemoryInCustomFolder,
        addMemoriesToCustomFolder,
        updateCustomFolderCover,
        updateMemoryInfo,
        reloadMemories,
    } = useMemories();

    const settingsSheetRef = useRef<SettingsSheetRef>(null);
    const { visible: librariesOverlayVisible, close: closeLibrariesOverlay } = useLibrariesOverlay();
    const [marketplaceVisible, setMarketplaceVisible] = useState(false);
    const [invitesVisible, setInvitesVisible] = useState(false);

    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [selectedMemoryForInfoId, setSelectedMemoryForInfoId] = useState<string | null>(null);
    const [actionSheetMemory, setActionSheetMemory] = useState<Memory | null>(null);
    const [activeMapLibraryFilter, setActiveMapLibraryFilter] = useState<MapLibraryFilter | null>(null);
    const [isLibraryFilterVisible, setIsLibraryFilterVisible] = useState(false);
    const [selectedFilterLibraryIds, setSelectedFilterLibraryIds] = useState<string[]>([]);
    const [currentGpsCountry, setCurrentGpsCountry] = useState<string | null>(null);
    const [isFilterCountryLoading, setIsFilterCountryLoading] = useState(false);
    const [markerRenderVersion, setMarkerRenderVersion] = useState(0);
    // Google Maps (PROVIDER_GOOGLE) cannot correctly snapshot or position
    // <Marker> children that mount before its native surface finishes
    // initializing. Mounting custom markers pre-`onMapReady` is the documented
    // root cause of clipped bitmaps and markers placed at wrong screen
    // coordinates. We gate marker rendering on this flag so every marker goes
    // through the same correct path the hide/show toggle hits.
    const [isMapReady, setIsMapReady] = useState(false);
    // Tracks the last folder-filter params we applied so re-renders don't
    // re-apply a filter the user has already manually cleared.
    const processedFolderFilterRef = useRef<string | null>(null);
    const filterCountryLookupRef = useRef<string | null>(null);

    const mapCurtainOpacity = useSharedValue(1);
    const mapCurtainStyle = useAnimatedStyle(() => ({ opacity: mapCurtainOpacity.value }));

    const selectedMemoryForInfo = useMemo(() => {
        if (!selectedMemoryForInfoId) return null;
        return memories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? sharedLibraryMemories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? null;
    }, [selectedMemoryForInfoId, memories, sharedLibraryMemories]);

    const selectedMemoryForActions = useMemo(() => {
        if (!actionSheetMemory) return null;
        return (
            memories.find((m) => m.id === actionSheetMemory.id)
            ?? sharedLibraryMemories.find((m) => m.id === actionSheetMemory.id)
            ?? actionSheetMemory
        );
    }, [actionSheetMemory, memories, sharedLibraryMemories]);

    const openMemoActions = useCallback((memory: Memory) => {
        setActionSheetMemory(memory);
    }, []);

    const closeMemoActions = useCallback(() => {
        setActionSheetMemory(null);
    }, []);

    const openMemoInfo = useCallback((memory: Memory) => {
        setSelectedMemoryForInfoId(memory.id);
        setIsInfoModalVisible(true);
    }, []);

    const closeMemoInfo = useCallback(() => {
        setIsInfoModalVisible(false);
        setSelectedMemoryForInfoId(null);
    }, []);

    const handleSaveMemoInfo = useCallback(async (title: string, description: string) => {
        if (!selectedMemoryForInfoId || selectedMemoryForInfo?.isShared) return;
        await updateMemoryInfo(selectedMemoryForInfoId, title, description);
        closeMemoInfo();
    }, [selectedMemoryForInfoId, selectedMemoryForInfo?.isShared, updateMemoryInfo, closeMemoInfo]);

    const {
        mapRef, location, loading: mapLocationLoading, searchQuery, searchResults,
        destinationLatitude, destinationLongitude, routeCoordinates,
        showRoute, showSearchBar, mapMoved, userChoseAddress, routeDistance,
        showMemories, showMemoriesOnMap, isMemoriesMapLoading, isGalleryVisible, isCountryLibraryVisible, isShareMemoryVisible, shareRecipient, memoryToShare,
        toggleShowMemoriesFromSettings, finishMemoriesMapLoad, revealMemoriesIncrementally,
        isAddingPlace, isNoPhotoDescriptionVisible, missingPhotoDescription,
        setShowMemories, setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace, setShareRecipient,
        getPlaceRoute, openDrivingInWaze, handleMarkerPress, returnToStartingPoint,
        setIsShareMemoryVisible, setMemoryToShare,
        setShowRoute, setShowSearchBar, setUserChoseAddress, setRouteDistance,
        setDestinationLongitude, setDestinationLatitude, setIsGalleryVisible, setIsCountryLibraryVisible,
        jumpToLocation, handleClearSearch, addSelectedPlaceAsMemory,
        setMissingPhotoDescription, closeNoPhotoDescriptionPrompt,
        saveNoPhotoPlaceWithoutDescription, saveNoPhotoPlaceWithDescription,
    } = useMapLogic(addPlaceMemory, openMemoActions);

    const handleOpenSettings = useCallback(() => {
        Keyboard.dismiss();
        setIsLibraryFilterVisible(false);
        settingsSheetRef.current?.open();
    }, []);

    const navigateInfo = useCallback(() => router.push('/onboarding/info'), [router]);

    const menuButtonTop = showSearchBar
        ? mapChromeTop + SEARCH_BAR_ROW_HEIGHT_PX + menuBelowSearchGap
        : mapChromeTop;

    const clearMapLibraryFilter = useCallback(() => {
        setActiveMapLibraryFilter(null);
        setSelectedFilterLibraryIds([]);
        setIsLibraryFilterVisible(false);
        setMarkerRenderVersion((prev) => prev + 1);
    }, []);

    const handleShowFolderOnMap = useCallback((folderId: string, folderType: 'country' | 'custom', folderName: string) => {
        if (folderType === 'country') {
            setActiveMapLibraryFilter({ mode: 'country', id: folderId, name: folderName });
        } else {
            setActiveMapLibraryFilter({ mode: 'custom', id: folderId, name: folderName });
        }
        setSelectedFilterLibraryIds(folderType === 'custom' ? [folderId] : []);
        setIsLibraryFilterVisible(false);
        setMarkerRenderVersion((prev) => prev + 1);
        setShowMemories(true);
        setIsGalleryVisible(false);
        setIsCountryLibraryVisible(false);
        closeLibrariesOverlay();
    }, [closeLibrariesOverlay, setShowMemories, setIsGalleryVisible, setIsCountryLibraryVisible]);

    const handleOpenInfoFromActions = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        openMemoInfo(target);
    }, [closeMemoActions, openMemoInfo, selectedMemoryForActions]);

    const handleWalkToMemo = useCallback(async () => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        setShowSearchBar(false);
        await returnToStartingPoint({ forceRefresh: true });
        const ok = await getPlaceRoute(target.latitude, target.longitude);
        if (ok) {
            setShowRoute(true);
        } else {
            setShowSearchBar(true);
        }
    }, [closeMemoActions, getPlaceRoute, returnToStartingPoint, selectedMemoryForActions, setShowRoute, setShowSearchBar]);

    const handleDriveToMemo = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        void openDrivingInWaze(target.latitude, target.longitude);
    }, [closeMemoActions, openDrivingInWaze, selectedMemoryForActions]);

    const handleShareMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        if (!auth.user) {
            alertRequireSignIn('Sign in to share this memo.');
            return;
        }
        setMemoryToShare(selectedMemoryForActions);
        setShareRecipient('');
        closeMemoActions();
        setIsShareMemoryVisible(true);
    }, [auth.user, closeMemoActions, selectedMemoryForActions, setIsShareMemoryVisible, setMemoryToShare, setShareRecipient]);

    const handleDeleteMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        const target = selectedMemoryForActions;
        Alert.alert(
            'Archive memo',
            'This removes the memo from your main map and country folders, but keeps it available in any libraries that still include it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteMemory(target.id),
                },
            ]
        );
    }, [deleteMemory, selectedMemoryForActions]);

    const isPlaceAlreadySaved = useMemo(() => {
        if (destinationLatitude === 0 || destinationLongitude === 0) return false;
        return [...memories.filter(memory => !memory.deletedAt), ...sharedLibraryMemories].some(m =>
            Math.abs(m.latitude - destinationLatitude) < 0.00005 &&
            Math.abs(m.longitude - destinationLongitude) < 0.00005
        );
    }, [memories, sharedLibraryMemories, destinationLatitude, destinationLongitude]);

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
        if (!currentGpsCountry || currentGpsCountry === UNKNOWN_LOCATION) return [];

        return customFolders
            // Your own country share mirror duplicates the country filter already on the map.
            .filter((folder) => !folder.countryShareOf || folder.isShared)
            .map((folder) => {
                const memoCount = [...memories, ...sharedLibraryMemories].filter((memory) =>
                    !memory.deletedAt &&
                    (memory.country || UNKNOWN_LOCATION) === currentGpsCountry &&
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
                ? prev.filter(id => id !== folderId)
                : [...prev, folderId]
        );
    }, []);

    const applyLibraryFilter = useCallback(() => {
        if (!currentGpsCountry || selectedFilterLibraryIds.length === 0) {
            clearMapLibraryFilter();
            return;
        }

        const selectedNames = relatedLibraryFilterOptions
            .filter(option => selectedFilterLibraryIds.includes(option.id))
            .map(option => option.name);

        setActiveMapLibraryFilter({
            mode: 'custom-multi',
            ids: selectedFilterLibraryIds,
            names: selectedNames,
            country: currentGpsCountry,
        });
        setShowMemories(true);
        setIsLibraryFilterVisible(false);
        setMarkerRenderVersion((prev) => prev + 1);
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
        setIsLibraryFilterVisible(prev => !prev);
    }, [activeMapLibraryFilter]);

    const visibleOwnedMemories = useMemo(() => {
        if (!activeMapLibraryFilter) return memories.filter(memory => !memory.deletedAt);
        if (activeMapLibraryFilter.mode === 'custom') {
            return memories.filter(memory =>
                !memory.deletedAt &&
                (memory.customFolderIds ?? []).includes(activeMapLibraryFilter.id)
            );
        }
        if (activeMapLibraryFilter.mode === 'custom-multi') {
            return memories.filter(memory =>
                !memory.deletedAt &&
                (memory.country || UNKNOWN_LOCATION) === activeMapLibraryFilter.country &&
                (memory.customFolderIds ?? []).some(folderId => activeMapLibraryFilter.ids.includes(folderId))
            );
        }
        return memories.filter(memory =>
            !memory.deletedAt &&
            !memory.excludeFromCountryFolder &&
            (memory.country || UNKNOWN_LOCATION) === activeMapLibraryFilter.name
        );
    }, [memories, activeMapLibraryFilter]);

    const visibleSharedMemories = useMemo(() => {
        if (!activeMapLibraryFilter) return sharedLibraryMemories;
        if (activeMapLibraryFilter.mode === 'custom') {
            return sharedLibraryMemories.filter(memory =>
                (memory.customFolderIds ?? []).includes(activeMapLibraryFilter.id)
            );
        }
        if (activeMapLibraryFilter.mode === 'custom-multi') {
            return sharedLibraryMemories.filter(memory =>
                !memory.deletedAt &&
                (memory.country || UNKNOWN_LOCATION) === activeMapLibraryFilter.country &&
                (memory.customFolderIds ?? []).some(folderId => activeMapLibraryFilter.ids.includes(folderId))
            );
        }
        return sharedLibraryMemories.filter(memory =>
            !memory.excludeFromCountryFolder &&
            (memory.country || UNKNOWN_LOCATION) === activeMapLibraryFilter.name
        );
    }, [sharedLibraryMemories, activeMapLibraryFilter]);

    const MAP_MEMORIES_CHUNK_SIZE = 35;

    const mapMemoryMarkers = useMemo(() => {
        const owned = visibleOwnedMemories
            .filter((m) => isValidMapCoordinate(m.latitude, m.longitude))
            .map((memory) => ({ memory, variant: 'owned' as const }));
        const shared = visibleSharedMemories
            .filter((m) => isValidMapCoordinate(m.latitude, m.longitude))
            .map((memory) => ({ memory, variant: 'shared' as const }));
        return [...owned, ...shared];
    }, [visibleOwnedMemories, visibleSharedMemories]);

    const [mapMemoriesRevealCount, setMapMemoriesRevealCount] = useState(0);
    const mapMemoriesLoadRunRef = useRef(0);
    const bulkMarkerLoadStartedRef = useRef(false);

    const mapMemoryMarkersToRender = useMemo(() => {
        if (!showMemoriesOnMap) return [];
        if (!isMemoriesMapLoading) return mapMemoryMarkers;
        return mapMemoryMarkers.slice(0, mapMemoriesRevealCount);
    }, [showMemoriesOnMap, isMemoriesMapLoading, mapMemoryMarkers, mapMemoriesRevealCount]);

    useEffect(() => {
        if (mapMemoryMarkers.length === 0) {
            bulkMarkerLoadStartedRef.current = false;
            return;
        }
        if (bulkMarkerLoadStartedRef.current) return;
        if (mapMemoryMarkers.length <= MAP_MEMORIES_CHUNK_SIZE) return;
        if (isMemoriesMapLoading) {
            bulkMarkerLoadStartedRef.current = true;
            return;
        }
        bulkMarkerLoadStartedRef.current = true;
        revealMemoriesIncrementally();
    }, [mapMemoryMarkers.length, isMemoriesMapLoading, revealMemoriesIncrementally]);

    useEffect(() => {
        if (!showMemoriesOnMap || !isMemoriesMapLoading) return;

        const runId = ++mapMemoriesLoadRunRef.current;
        const total = mapMemoryMarkers.length;

        if (total === 0) {
            finishMemoriesMapLoad();
            return;
        }

        let revealed = 0;
        setMapMemoriesRevealCount(0);

        const step = () => {
            if (mapMemoriesLoadRunRef.current !== runId) return;

            revealed = Math.min(revealed + MAP_MEMORIES_CHUNK_SIZE, total);
            setMapMemoriesRevealCount(revealed);

            if (revealed >= total) {
                finishMemoriesMapLoad();
                return;
            }

            requestAnimationFrame(() => {
                requestAnimationFrame(step);
            });
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(step);
        });

        return () => {
            mapMemoriesLoadRunRef.current += 1;
        };
    }, [showMemoriesOnMap, isMemoriesMapLoading, mapMemoryMarkers, finishMemoriesMapLoad]);

    const initialMapCenterDoneRef = useRef(false);
    useEffect(() => {
        if (!location || !isMapReady || initialMapCenterDoneRef.current) return;
        initialMapCenterDoneRef.current = true;
        void returnToStartingPoint({ forceRefresh: false });
    }, [location, isMapReady, returnToStartingPoint]);

    const { focusLat, focusLng, folderId, folderType, folderName } = useLocalSearchParams<{
        focusLat?: string;
        focusLng?: string;
        folderId?: string;
        folderType?: string;
        folderName?: string;
    }>();

    useEffect(() => {
        if (!focusLat || !focusLng) return;
        const lat = parseFloat(focusLat);
        const lng = parseFloat(focusLng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            jumpToLocation(lat, lng);
        }
    }, [focusLat, focusLng, jumpToLocation]);

    useEffect(() => {
        if (!folderId || !folderType || !folderName) return;
        const paramKey = `${folderId}:${folderType}:${folderName}`;
        if (processedFolderFilterRef.current === paramKey) return;
        processedFolderFilterRef.current = paramKey;
        if (folderType !== 'country' && folderType !== 'custom') return;
        handleShowFolderOnMap(folderId, folderType, folderName);
    }, [folderId, folderType, folderName, handleShowFolderOnMap]);

    return (
        <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
            {!librariesOverlayVisible ? (
                <>
                    <TouchableOpacity
                        onPress={handleOpenSettings}
                        style={[
                            styles.menuButton,
                            {
                                top: menuButtonTop,
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                            },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Settings"
                    >
                        <Ionicons name="menu-outline" size={26} color={theme.colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={toggleLibraryFilterPopover}
                        style={[
                            styles.filterButton,
                            {
                                top: menuButtonTop,
                                backgroundColor: theme.colors.surface,
                                borderColor: activeMapLibraryFilter?.mode === 'custom-multi' ? theme.colors.accent : theme.colors.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="funnel-outline"
                            size={26}
                            color={activeMapLibraryFilter?.mode === 'custom-multi' ? theme.colors.accent : theme.colors.textSecondary}
                        />
                    </TouchableOpacity>

                    {isLibraryFilterVisible ? (
                        <View
                            style={[
                                styles.libraryFilterPopover,
                                {
                                    top: menuButtonTop + 54,
                                    backgroundColor: theme.colors.surface,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <View style={styles.libraryFilterHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.libraryFilterTitle, { color: theme.colors.text }]}>
                                        {currentGpsCountry && currentGpsCountry !== UNKNOWN_LOCATION
                                            ? currentGpsCountry
                                            : 'Nearby'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setIsLibraryFilterVisible(false)} hitSlop={8}>
                                    <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                                </TouchableOpacity>
                            </View>

                            {isFilterCountryLoading ? (
                                <View style={styles.libraryFilterEmpty}>
                                    <ActivityIndicator size="small" color={theme.colors.accent} />
                                    <Text style={[styles.libraryFilterEmptyText, { color: theme.colors.textMuted }]}>
                                        Finding your current country...
                                    </Text>
                                </View>
                            ) : relatedLibraryFilterOptions.length === 0 ? (
                                <View style={styles.libraryFilterEmpty}>
                                    <Ionicons name="folder-open-outline" size={28} color={theme.colors.textMuted} />
                                    <Text style={[styles.libraryFilterEmptyText, { color: theme.colors.textMuted }]}>
                                        No related libraries found here.
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <ScrollView style={styles.libraryFilterList} showsVerticalScrollIndicator={false}>
                                        {relatedLibraryFilterOptions.map((option) => {
                                            const isSelected = selectedFilterLibraryIds.includes(option.id);
                                            return (
                                                <TouchableOpacity
                                                    key={option.id}
                                                    onPress={() => toggleFilterLibrary(option.id)}
                                                    style={[
                                                        styles.libraryFilterRow,
                                                        {
                                                            backgroundColor: isSelected ? theme.colors.accentSoft : theme.colors.surfaceMuted,
                                                            borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                                                        },
                                                    ]}
                                                >
                                                    {option.coverImageUrl ? (
                                                        <ExpoImage
                                                            source={{ uri: option.coverImageUrl }}
                                                            style={styles.libraryFilterCover}
                                                            contentFit="cover"
                                                            cachePolicy="memory-disk"
                                                        />
                                                    ) : (
                                                        <View style={[styles.libraryFilterCoverFallback, { backgroundColor: theme.colors.accentSoft }]}>
                                                            <Ionicons name="folder-open" size={18} color={theme.colors.accent} />
                                                        </View>
                                                    )}
                                                    <View style={styles.libraryFilterRowText}>
                                                        <Text style={[styles.libraryFilterOptionName, { color: theme.colors.text }]} numberOfLines={1}>
                                                            {option.name}
                                                        </Text>
                                                    </View>
                                                    <Ionicons
                                                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                                        size={22}
                                                        color={isSelected ? theme.colors.accent : theme.colors.borderStrong}
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>

                                    <View style={styles.libraryFilterActions}>
                                        <TouchableOpacity
                                            onPress={clearMapLibraryFilter}
                                            style={[styles.libraryFilterSecondaryAction, { borderColor: theme.colors.border }]}
                                        >
                                            <Text style={[styles.libraryFilterSecondaryText, { color: theme.colors.textSecondary }]}>
                                                Clear
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={applyLibraryFilter}
                                            style={[styles.libraryFilterPrimaryAction, { backgroundColor: theme.colors.accent }]}
                                        >
                                            <Text style={styles.libraryFilterPrimaryText}>Apply</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </View>
                    ) : null}
                </>
            ) : null}

            <SearchBar
                showSearchBar={showSearchBar}
                searchQuery={searchQuery}
                searchResults={searchResults}
                fetchPlaces={fetchPlaces}
                onClearSearch={handleClearSearch}
                handleSelectPlace={handleSelectPlace}
            />

            <View style={styles.mapShell}>
                {mapLocationLoading && !location ? (
                    <View style={styles.mapLocationLoading}>
                        <ActivityIndicator size="large" color={theme.colors.accent} />
                    </View>
                ) : (
                <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    customMapStyle={isDarkMode ? darkMapStyle : undefined}
                    style={{ flex: 1 }}
                    onMapReady={() => {
                        mapCurtainOpacity.value = withTiming(0, { duration: 300 });
                    }}
                    onMapLoaded={() => setIsMapReady(true)}
                    onPanDrag={() => setMapMoved(true)}
                    onPress={() => {
                        Keyboard.dismiss();
                        setIsLibraryFilterVisible(false);
                    }}
                    showsUserLocation={true}
                    showsCompass={true}
                    rotateEnabled={true}
                    showsPointsOfInterest={true}
                    initialRegion={{
                        latitude: location?.coords.latitude ?? 32.0853,
                        longitude: location?.coords.longitude ?? 34.7818,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >
                    {userChoseAddress && !isPlaceAlreadySaved && destinationLatitude !== 0 && destinationLongitude !== 0 && (
                        <Marker
                            key="destination-pin"
                            coordinate={{
                                latitude: destinationLatitude,
                                longitude: destinationLongitude,
                            }}
                            title="Destination"
                            description={searchQuery}
                            pinColor="red"
                            zIndex={1}
                        />
                    )}

                    {isMapReady &&
                        mapMemoryMarkersToRender.map(({ memory, variant }) => (
                            <MapMemoryMarker
                                key={`${variant}-${markerRenderVersion}-${memory.id}`}
                                memory={memory}
                                variant={variant}
                                onMarkerPress={handleMarkerPress}
                            />
                        ))}

                    {routeCoordinates?.length && showRoute && (
                        <Polyline
                            coordinates={routeCoordinates}
                            strokeColor="#3B82F6"
                            strokeWidth={4}
                            lineCap="round"
                            lineJoin="round"
                            lineDashPattern={[8, 15]}
                        />
                    )}
                </MapView>
                )}

                {/* Fades out once onMapReady fires, hiding the blank tile-loading phase */}
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: theme.colors.background },
                        mapCurtainStyle,
                    ]}
                />

                <View style={{ position: 'absolute', bottom: 30 + tabBarHeight, left: 30, zIndex: 100 }}>
                    {activeMapLibraryFilter && (
                        <View style={{ marginBottom: 8 }}>
                            <TouchableOpacity
                                onPress={clearMapLibraryFilter}
                                className="h-[38px] px-3 bg-slate-700 rounded-2xl items-center justify-center"
                            >
                                <Text className="text-white font-bold">Show all memos</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {userChoseAddress && !showRoute && !isPlaceAlreadySaved && (
                        <View className="flex-row gap-x-2">
                            <TouchableOpacity
                                onPress={() => {
                                    Alert.alert(
                                        'Choose route type',
                                        'How would you like to navigate?',
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            {
                                                text: 'Walk',
                                                onPress: () => {
                                                    void (async () => {
                                                        setShowSearchBar(false);
                                                        await returnToStartingPoint();
                                                        const ok = await getPlaceRoute();
                                                        if (ok) {
                                                            setShowRoute(true);
                                                        } else {
                                                            setShowSearchBar(true);
                                                        }
                                                    })();
                                                },
                                            },
                                            {
                                                text: 'Drive with Waze',
                                                onPress: () => openDrivingInWaze(),
                                            },
                                        ]
                                    );
                                }}
                                className="h-[36px] min-w-[88px] px-3 bg-blue-600 rounded-xl items-center justify-center shadow-lg"
                            >
                                <Text className="text-white font-semibold text-[15px]">Route</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={addSelectedPlaceAsMemory}
                                disabled={isAddingPlace}
                                className="h-[36px] min-w-[104px] px-3.5 bg-green-500 rounded-xl items-center justify-center shadow-lg"
                                style={{ opacity: isAddingPlace ? 0.7 : 1 }}
                            >
                                {isAddingPlace ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text className="text-white font-semibold text-[15px]">Add Memo</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {showRoute && (
                        <TouchableOpacity
                            onPress={() => {
                                setShowRoute(false);
                                returnToStartingPoint();
                                setShowSearchBar(true);
                                setRouteDistance('');
                                setDestinationLatitude(0);
                                setDestinationLongitude(0);
                                setUserChoseAddress(false);
                                setSearchQuery('');
                            }}
                            className="h-[40px] w-[100px] bg-red-500 rounded-2xl items-center justify-center shadow-lg"
                        >
                            <Text className="text-white font-bold text-lg">Stop</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {routeDistance ? (
                    <View style={{ position: 'absolute', bottom: 80 + tabBarHeight, left: 30, zIndex: 100 }}>
                        <View style={[styles.routeDistancePill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <Text style={[styles.routeDistanceText, { color: theme.colors.textSecondary }]}>🚶 {routeDistance} walk</Text>
                        </View>
                    </View>
                ) : null}

                {mapMoved && (
                    <TouchableOpacity
                        onPress={() => {
                            void returnToStartingPoint({ forceRefresh: true });
                            setMapMoved(false);
                        }}
                        style={[styles.recenterButton, { bottom: 50 + tabBarHeight, backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }]}
                    >
                        <Ionicons name="locate" size={24} color={theme.colors.accentText} />
                    </TouchableOpacity>
                )}
            </View>

            {actionSheetMemory ? (
                <MemoActionsSheet
                    memory={selectedMemoryForActions ?? actionSheetMemory}
                    onClose={closeMemoActions}
                    onOpenInfo={handleOpenInfoFromActions}
                    onStartWalkingRoute={() => { void handleWalkToMemo(); }}
                    onOpenDrivingRoute={handleDriveToMemo}
                    onShare={handleShareMemoFromActions}
                    onDelete={handleDeleteMemoFromActions}
                />
            ) : null}

            <LibraryModal
                visible={isGalleryVisible || isCountryLibraryVisible || librariesOverlayVisible}
                enableSwipeToClose={librariesOverlayVisible && !isGalleryVisible && !isCountryLibraryVisible}
                onClose={() => {
                    setIsGalleryVisible(false);
                    setIsCountryLibraryVisible(false);
                    closeLibrariesOverlay();
                }}
                variant={isCountryLibraryVisible || librariesOverlayVisible ? 'countries' : 'custom'}
                memories={memories}
                sharedLibraryMemories={sharedLibraryMemories}
                customFolders={customFolders}
                createCustomFolder={createCustomFolder}
                removeLibrary={removeLibrary}
                shareCustomFolder={shareCustomFolder}
                shareCountryFolder={shareCountryFolder}
                grantLibraryEditAccess={grantLibraryEditAccess}
                addPlaceMemory={addPlaceMemory}
                toggleMemoryInCustomFolder={toggleMemoryInCustomFolder}
                addMemoriesToCustomFolder={addMemoriesToCustomFolder}
                updateCustomFolderCover={updateCustomFolderCover}
                jumpToLocation={jumpToLocation}
                onShowFolderOnMap={handleShowFolderOnMap}
                deleteMemory={deleteMemory}
            />

            <MemoInfoModal
                visible={isInfoModalVisible}
                memory={selectedMemoryForInfo}
                readOnly={selectedMemoryForInfo?.isShared === true}
                onClose={closeMemoInfo}
                onSave={handleSaveMemoInfo}
            />

            <ShareMemoryModal
                visible={isShareMemoryVisible}
                onClose={() => setIsShareMemoryVisible(false)}
                shareRecipient={shareRecipient}
                setShareRecipient={setShareRecipient}
                memoryToShare={memoryToShare}
                onSubmit={handleShareSubmit}
            />

            <PlaceDescriptionModal
                visible={isNoPhotoDescriptionVisible}
                isSaving={isAddingPlace}
                description={missingPhotoDescription}
                onChangeDescription={setMissingPhotoDescription}
                onClose={closeNoPhotoDescriptionPrompt}
                onSkip={saveNoPhotoPlaceWithoutDescription}
                onSaveWithDescription={saveNoPhotoPlaceWithDescription}
            />

            <SettingsSheet
                ref={settingsSheetRef}
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                showMemories={showMemories}
                onShowMemoriesChange={toggleShowMemoriesFromSettings}
                showLoginRow={!auth.user}
                onOpenLogin={() => router.push('/Login')}
                onOpenMarketplace={() => setMarketplaceVisible(true)}
                onOpenInvites={() => {
                    if (!auth.user) {
                        alertRequireSignIn('Sign in to see and manage your invitations.');
                        return;
                    }
                    setInvitesVisible(true);
                }}
                onOpenInfo={navigateInfo}
                onOpenAccount={() => {
                    if (!auth.user) {
                        alertRequireSignIn('Sign in to open your account settings.');
                        return;
                    }
                    router.push('/account');
                }}
                onOpenPlan={() => router.push('/onboarding/plan')}
            />

            <InvitesModal visible={invitesVisible} onClose={() => setInvitesVisible(false)} />
            <MarketPlaceModal
                visible={marketplaceVisible}
                onClose={() => setMarketplaceVisible(false)}
                userId={auth.user?.id}
                customFolders={customFolders}
                memories={memories}
                reloadMemories={reloadMemories}
            />

            <MemoriesMapLoadOverlay visible={isMemoriesMapLoading} />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        alignItems: 'center',
    },
    mapShell: {
        height: '100%',
        width: '100%',
        borderRadius: 24,
        overflow: 'hidden',
    },
    mapLocationLoading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuButton: {
        position: 'absolute',
        right: 18,
        backgroundColor: 'transparent',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        elevation: 10,
        zIndex: 1000,
    },
    filterButton: {
        position: 'absolute',
        right: 76,
        backgroundColor: 'transparent',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        elevation: 10,
        zIndex: 1000,
    },
    libraryFilterPopover: {
        position: 'absolute',
        right: 76,
        width: 292,
        maxHeight: 384,
        borderRadius: 22,
        borderWidth: 1,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 12,
        zIndex: 1001,
    },
    libraryFilterHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 12,
    },
    libraryFilterTitle: {
        fontSize: 16,
        fontWeight: '800',
    },
    libraryFilterList: {
        maxHeight: 220,
    },
    libraryFilterRow: {
        minHeight: 58,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    libraryFilterCover: {
        width: 40,
        height: 40,
        borderRadius: 12,
    },
    libraryFilterCoverFallback: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterRowText: {
        flex: 1,
    },
    libraryFilterOptionName: {
        fontSize: 14,
        fontWeight: '700',
    },
    libraryFilterActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 6,
    },
    libraryFilterSecondaryAction: {
        flex: 1,
        height: 42,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterPrimaryAction: {
        flex: 1,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterSecondaryText: {
        fontSize: 14,
        fontWeight: '700',
    },
    libraryFilterPrimaryText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
    },
    libraryFilterEmpty: {
        minHeight: 118,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 18,
    },
    libraryFilterEmptyText: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    markerContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    markerPinWrapper: {
        width: 72,
        height: 86,
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'visible',
    },
    markerAvatarOuter: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 3,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerAccentRing: {
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 2,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    markerGradientInner: {
        flex: 1,
        margin: 2,
        borderRadius: 27,
        overflow: 'hidden',
    },
    markerAvatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 29,
        backgroundColor: 'transparent',
    },
    markerStem: {
        width: 3,
        height: 16,
        marginTop: -5,
        borderRadius: 999,
    },
    routeDistancePill: {
        height: 45,
        width: 150,
        padding: 12,
        borderRadius: 24,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeDistanceText: {
        fontWeight: '700',
    },
    recenterButton: {
        position: 'absolute',
        right: 20,
        zIndex: 100,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(37, 99, 235, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(147, 197, 253, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1d4ed8',
        shadowOpacity: 0.26,
        shadowRadius: 10,
        elevation: 6,
    },
});
