import LibraryModal from '@/components/LibraryModal';
import MapBottomActions from '@/components/home/MapBottomActions';
import HomeOverlayModals from '@/components/home/HomeOverlayModals';
import MapLibraryFilterControl from '@/components/home/MapLibraryFilterControl';
import { MemoriesMapLoadOverlay } from '@/components/MemoriesMapLoadOverlay';
import MapMemoryMarkerList from '@/components/map/MapMemoryMarkerList';
import SearchBar, { SEARCH_BAR_ROW_HEIGHT_PX } from '@/components/SearchBar';
import { type SettingsSheetRef } from '@/components/SettingsSheet';
import { darkMapStyle } from '@/constants/darkMapStyle';
import { useAuth } from '@/context/AuthContext';
import { useLibrariesOverlay } from '@/context/LibrariesOverlayContext';
import { type Memory, useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { useClusteredMapMarkers } from '@/hooks/useClusteredMapMarkers';
import { useHomeMemoActions } from '@/hooks/useHomeMemoActions';
import { useMapLibraryFilter } from '@/hooks/useMapLibraryFilter';
import { useMapLogic } from '@/hooks/useMapLogic';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_LATITUDE = 32.0853;
const DEFAULT_LONGITUDE = 34.7818;
const INITIAL_LONGITUDE_DELTA = 0.01;

export default function MapScreen() {
    const insets = useSafeAreaInsets();
    const tabBarHeight = useBottomTabBarHeight();
    const router = useRouter();
    const auth = useAuth();
    const { isDarkMode, setIsDarkMode, theme } = useAppTheme();
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
    const [isMapReady, setIsMapReady] = useState(false);
    const processedFolderFilterRef = useRef<string | null>(null);
    const openMemoActionsRef = useRef<(memory: Memory) => void>(() => {});
    const handleMarkerAction = useCallback((memory: Memory) => {
        openMemoActionsRef.current(memory);
    }, []);

    const mapCurtainOpacity = useSharedValue(1);
    const mapCurtainStyle = useAnimatedStyle(() => ({ opacity: mapCurtainOpacity.value }));

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
    } = useMapLogic(addPlaceMemory, handleMarkerAction);

    const {
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
    } = useMapLibraryFilter({
        memories,
        sharedLibraryMemories,
        customFolders,
        location,
        setShowMemories,
        setIsGalleryVisible,
        setIsCountryLibraryVisible,
        closeLibrariesOverlay,
    });

    const {
        isInfoModalVisible,
        actionSheetMemory,
        selectedMemoryForInfo,
        selectedMemoryForActions,
        openMemoActions,
        closeMemoActions,
        closeMemoInfo,
        handleSaveMemoInfo,
        handleOpenInfoFromActions,
        handleWalkToMemo,
        handleDriveToMemo,
        handleShareMemoFromActions,
        handleDeleteMemoFromActions,
    } = useHomeMemoActions({
        memories,
        sharedLibraryMemories,
        user: auth.user,
        updateMemoryInfo,
        deleteMemory,
        returnToStartingPoint,
        getPlaceRoute,
        openDrivingInWaze,
        setShowSearchBar,
        setShowRoute,
        setMemoryToShare,
        setShareRecipient,
        setIsShareMemoryVisible,
    });
    openMemoActionsRef.current = openMemoActions;

    const handleOpenSettings = useCallback(() => {
        Keyboard.dismiss();
        setIsLibraryFilterVisible(false);
        settingsSheetRef.current?.open();
    }, [setIsLibraryFilterVisible]);

    const navigateInfo = useCallback(() => router.push('/onboarding/info'), [router]);
    const menuButtonTop = showSearchBar
        ? mapChromeTop + SEARCH_BAR_ROW_HEIGHT_PX + menuBelowSearchGap
        : mapChromeTop;

    const isPlaceAlreadySaved = useMemo(() => {
        if (destinationLatitude === 0 || destinationLongitude === 0) return false;
        return [...memories.filter((memory) => !memory.deletedAt), ...sharedLibraryMemories].some((memory) =>
            Math.abs(memory.latitude - destinationLatitude) < 0.00005 &&
            Math.abs(memory.longitude - destinationLongitude) < 0.00005
        );
    }, [memories, sharedLibraryMemories, destinationLatitude, destinationLongitude]);

    const { markerItemsToRender, handleRegionChangeComplete, handleClusterPress } = useClusteredMapMarkers({
        ownedMemories: visibleOwnedMemories,
        sharedMemories: visibleSharedMemories,
        showMemoriesOnMap,
        isMemoriesMapLoading,
        revealMemoriesIncrementally,
        finishMemoriesMapLoad,
        mapRef,
        insetsTop: insets.top,
        tabBarHeight,
    });

    const handleRoutePress = useCallback(() => {
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
                    onPress: () => {
                        void openDrivingInWaze();
                    },
                },
            ]
        );
    }, [getPlaceRoute, openDrivingInWaze, returnToStartingPoint, setShowRoute, setShowSearchBar]);

    const handleStopRoute = useCallback(() => {
        setShowRoute(false);
        void returnToStartingPoint();
        setShowSearchBar(true);
        setRouteDistance('');
        setDestinationLatitude(0);
        setDestinationLongitude(0);
        setUserChoseAddress(false);
        setSearchQuery('');
    }, [
        returnToStartingPoint,
        setDestinationLatitude,
        setDestinationLongitude,
        setRouteDistance,
        setSearchQuery,
        setShowRoute,
        setShowSearchBar,
        setUserChoseAddress,
    ]);

    const handleRecenter = useCallback(() => {
        void returnToStartingPoint({ forceRefresh: true });
        setMapMoved(false);
    }, [returnToStartingPoint, setMapMoved]);

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
                    <MapLibraryFilterControl
                        top={menuButtonTop}
                        activeMapLibraryFilter={activeMapLibraryFilter}
                        isVisible={isLibraryFilterVisible}
                        currentGpsCountry={currentGpsCountry}
                        isCountryLoading={isFilterCountryLoading}
                        options={relatedLibraryFilterOptions}
                        selectedLibraryIds={selectedFilterLibraryIds}
                        onToggle={toggleLibraryFilterPopover}
                        onClose={() => setIsLibraryFilterVisible(false)}
                        onToggleLibrary={toggleFilterLibrary}
                        onClear={clearMapLibraryFilter}
                        onApply={applyLibraryFilter}
                    />
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
                        onRegionChangeComplete={handleRegionChangeComplete}
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
                            latitude: location?.coords.latitude ?? DEFAULT_LATITUDE,
                            longitude: location?.coords.longitude ?? DEFAULT_LONGITUDE,
                            latitudeDelta: INITIAL_LONGITUDE_DELTA,
                            longitudeDelta: INITIAL_LONGITUDE_DELTA,
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

                        {/* Custom markers snapshot incorrectly if they mount before the native map is ready. */}
                        {isMapReady ? (
                            <MapMemoryMarkerList
                                items={markerItemsToRender}
                                onMarkerPress={handleMarkerPress}
                                onClusterPress={handleClusterPress}
                            />
                        ) : null}

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

                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: theme.colors.background },
                        mapCurtainStyle,
                    ]}
                />

                <MapBottomActions
                    tabBarHeight={tabBarHeight}
                    activeMapLibraryFilter={activeMapLibraryFilter}
                    onClearFilter={clearMapLibraryFilter}
                    userChoseAddress={userChoseAddress}
                    showRoute={showRoute}
                    isPlaceAlreadySaved={isPlaceAlreadySaved}
                    isAddingPlace={isAddingPlace}
                    routeDistance={routeDistance}
                    mapMoved={mapMoved}
                    onRoutePress={handleRoutePress}
                    onAddMemo={addSelectedPlaceAsMemory}
                    onStopRoute={handleStopRoute}
                    onRecenter={handleRecenter}
                />
            </View>

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

            <HomeOverlayModals
                userId={auth.user?.id}
                isSignedIn={Boolean(auth.user)}
                actionSheetMemory={actionSheetMemory}
                selectedMemoryForActions={selectedMemoryForActions}
                onCloseActions={closeMemoActions}
                onOpenInfoFromActions={handleOpenInfoFromActions}
                onStartWalkingRoute={() => { void handleWalkToMemo(); }}
                onOpenDrivingRoute={handleDriveToMemo}
                onShareFromActions={handleShareMemoFromActions}
                onDeleteFromActions={handleDeleteMemoFromActions}
                isInfoModalVisible={isInfoModalVisible}
                selectedMemoryForInfo={selectedMemoryForInfo}
                onCloseInfo={closeMemoInfo}
                onSaveInfo={handleSaveMemoInfo}
                isShareMemoryVisible={isShareMemoryVisible}
                onCloseShare={() => setIsShareMemoryVisible(false)}
                shareRecipient={shareRecipient}
                setShareRecipient={setShareRecipient}
                memoryToShare={memoryToShare}
                onSubmitShare={handleShareSubmit}
                isNoPhotoDescriptionVisible={isNoPhotoDescriptionVisible}
                isAddingPlace={isAddingPlace}
                missingPhotoDescription={missingPhotoDescription}
                onChangeMissingPhotoDescription={setMissingPhotoDescription}
                onCloseNoPhotoDescription={closeNoPhotoDescriptionPrompt}
                onSkipNoPhotoDescription={saveNoPhotoPlaceWithoutDescription}
                onSaveNoPhotoDescription={saveNoPhotoPlaceWithDescription}
                settingsSheetRef={settingsSheetRef}
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                showMemories={showMemories}
                onShowMemoriesChange={toggleShowMemoriesFromSettings}
                onOpenInfo={navigateInfo}
                invitesVisible={invitesVisible}
                onCloseInvites={() => setInvitesVisible(false)}
                onOpenInvites={() => setInvitesVisible(true)}
                marketplaceVisible={marketplaceVisible}
                onOpenMarketplace={() => setMarketplaceVisible(true)}
                onCloseMarketplace={() => setMarketplaceVisible(false)}
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
});
