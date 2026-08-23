import InvitesModal from '@/components/InvitesModal';
import LibraryModal from '@/components/LibraryModal';
import MarketPlaceModal from '@/components/MarketPlaceModal';
import MemoActionsSheet from '@/components/MemoActionsSheet';
import MemoInfoModal from '@/components/MemoInfoModal';
import PlaceDescriptionModal from '@/components/PlaceDescriptionModal';
import SearchBar from '@/components/SearchBar';
import SettingsSheet, { type SettingsSheetRef } from '@/components/SettingsSheet';
import ShareMemoryModal from '@/components/ShareMemoryModal';
import { darkMapStyle } from '@/constants/darkMapStyle';
import { useAuth } from '@/context/AuthContext';
import { type Memory, useMemories } from '@/context/MemoryContext';
import { useMapLogic } from '@/hooks/useMapLogic';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

function isValidMapCoordinate(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
    );
}

type MapMemoryMarkerProps = {
    memory: Memory;
    variant: 'owned' | 'shared';
    index: number;
    onMarkerPress: (memory: Memory) => void;
};

function MapMemoryMarker({ memory, variant, index, onMarkerPress }: MapMemoryMarkerProps) {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const accentColor = variant === 'owned' ? '#1d4ed8' : '#2563eb';

    return (
        <Marker
            coordinate={{
                latitude: memory.latitude,
                longitude: memory.longitude,
            }}
            onPress={() => onMarkerPress(memory)}
            tracksViewChanges={tracksViewChanges}
        >
            <View style={styles.markerPinWrapper}>
                <View
                    style={[
                        styles.markerContainer,
                        styles.markerAvatarOuter,
                        {
                            borderColor: variant === 'shared' ? '#7c3aed' : 'transparent',
                            borderWidth: variant === 'shared' ? 3 : 0,
                            backgroundColor: variant === 'shared' ? 'white' : 'transparent',
                            width: variant === 'shared' ? 68 : 58,
                            height: variant === 'shared' ? 68 : 58,
                            borderRadius: variant === 'shared' ? 34 : 29,
                        },
                    ]}
                >
                    <View style={[styles.markerAccentRing, { borderColor: accentColor }]}>
                        <ExpoImage
                            source={{ uri: memory.uri }}
                            style={styles.markerAvatarImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            onLoad={() => setTracksViewChanges(false)}
                            onError={() => setTracksViewChanges(false)}
                        />
                    </View>
                </View>
                <View style={[styles.markerStem, { backgroundColor: accentColor }]} />
            </View>
        </Marker>
    );
}

export default function MapScreen() {
    const {
        memories,
        sharedLibraryMemories,
        customFolders,
        deleteMemory,
        addPlaceMemory,
        handleShareSubmit,
        shareCustomFolder,
        grantLibraryEditAccess,
        removeLibrary,
        createCustomFolder,
        toggleMemoryInCustomFolder,
        updateCustomFolderCover,
        updateMemoryInfo,
        reloadMemories,
    } = useMemories();
    const auth = useAuth();

    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [selectedMemoryForInfo, setSelectedMemoryForInfo] = useState<Memory | null>(null);
    const [selectedMemoryForActions, setSelectedMemoryForActions] = useState<Memory | null>(null);
    const [activeMapLibraryFilter, setActiveMapLibraryFilter] = useState<{
        id: string;
        type: 'country' | 'custom';
        name: string;
    } | null>(null);
    const [markerRenderVersion, setMarkerRenderVersion] = useState(0);
    const [isInvitesVisible, setIsInvitesVisible] = useState(false);
    const [isMarketplaceVisible, setIsMarketplaceVisible] = useState(false);

    const openMemoInfo = useCallback((memory: Memory) => {
        setSelectedMemoryForInfo(memory);
        setIsInfoModalVisible(true);
    }, []);

    const openMemoActions = useCallback((memory: Memory) => {
        setSelectedMemoryForActions(memory);
    }, []);

    const closeMemoActions = useCallback(() => {
        setSelectedMemoryForActions(null);
    }, []);

    const closeMemoInfo = useCallback(() => {
        setIsInfoModalVisible(false);
        setSelectedMemoryForInfo(null);
    }, []);

    const handleSaveMemoInfo = useCallback(async (title: string, description: string) => {
        if (!selectedMemoryForInfo || selectedMemoryForInfo.isShared) return;
        await updateMemoryInfo(selectedMemoryForInfo.id, title, description);
        closeMemoInfo();
    }, [selectedMemoryForInfo, updateMemoryInfo, closeMemoInfo]);

    const {
        mapRef, location, loading, searchQuery, searchResults, isDarkMode,
        destinationLatitude, destinationLongitude, routeCoordinates,
        showRoute, showSearchBar, mapMoved, userChoseAddress, routeDistance,
        showMemories, isGalleryVisible, isShareMemoryVisible, shareEmail, memoryToShare,
        isAddingPlace, isNoPhotoDescriptionVisible, missingPhotoDescription,
        setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace, setShareEmail,
        getPlaceRoute, openDrivingInWaze, handleMarkerPress, returnToStartingPoint,
        setIsShareMemoryVisible, setIsDarkMode, setMemoryToShare,
        setShowRoute, setShowSearchBar, setUserChoseAddress, setRouteDistance,
        setDestinationLongitude, setDestinationLatitude, setShowMemories, setIsGalleryVisible,
        jumpToLocation, handleClearSearch, addSelectedPlaceAsMemory,
        setMissingPhotoDescription, closeNoPhotoDescriptionPrompt,
        saveNoPhotoPlaceWithoutDescription, saveNoPhotoPlaceWithDescription,
    } = useMapLogic(addPlaceMemory, openMemoActions);

    const settingsSheetRef = useRef<SettingsSheetRef>(null);

    const clearMapLibraryFilter = useCallback(() => {
        setActiveMapLibraryFilter(null);
        setMarkerRenderVersion((prev) => prev + 1);
    }, []);

    const handleShowFolderOnMap = useCallback((folderId: string, folderType: 'country' | 'custom', folderName: string) => {
        setActiveMapLibraryFilter({ id: folderId, type: folderType, name: folderName });
        setMarkerRenderVersion((prev) => prev + 1);
        setShowMemories(true);
        setIsGalleryVisible(false);
    }, [setShowMemories, setIsGalleryVisible]);

    const handleOpenInfoFromActions = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const targetMemory = selectedMemoryForActions;
        closeMemoActions();
        openMemoInfo(targetMemory);
    }, [closeMemoActions, openMemoInfo, selectedMemoryForActions]);

    const handleWalkToMemo = useCallback(async () => {
        if (!selectedMemoryForActions) return;
        const targetMemory = selectedMemoryForActions;
        closeMemoActions();
        setShowSearchBar(false);
        await returnToStartingPoint();
        const ok = await getPlaceRoute(targetMemory.latitude, targetMemory.longitude);
        if (ok) {
            setShowRoute(true);
        } else {
            setShowSearchBar(true);
        }
    }, [closeMemoActions, getPlaceRoute, returnToStartingPoint, selectedMemoryForActions, setShowRoute, setShowSearchBar]);

    const handleDriveToMemo = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const targetMemory = selectedMemoryForActions;
        closeMemoActions();
        void openDrivingInWaze(targetMemory.latitude, targetMemory.longitude);
    }, [closeMemoActions, openDrivingInWaze, selectedMemoryForActions]);

    const handleShareMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        setMemoryToShare(selectedMemoryForActions);
        setShareEmail('');
        closeMemoActions();
        setIsShareMemoryVisible(true);
    }, [closeMemoActions, selectedMemoryForActions, setIsShareMemoryVisible, setMemoryToShare, setShareEmail]);

    const handleDeleteMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        const targetMemory = selectedMemoryForActions;
        Alert.alert(
            'Archive memo',
            'This removes the memo from your main map and country folders, but keeps it available in any libraries that still include it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        closeMemoActions();
                        deleteMemory(targetMemory.id);
                    },
                },
            ]
        );
    }, [closeMemoActions, deleteMemory, selectedMemoryForActions]);

    const isPlaceAlreadySaved = useMemo(() => {
        if (!userChoseAddress || destinationLatitude === 0) return false;
        return [...memories.filter(memory => !memory.deletedAt), ...sharedLibraryMemories].some(m =>
            Math.abs(m.latitude - destinationLatitude) < 0.00005 &&
            Math.abs(m.longitude - destinationLongitude) < 0.00005
        );
    }, [memories, sharedLibraryMemories, destinationLatitude, destinationLongitude, userChoseAddress]);

    const visibleOwnedMemories = useMemo(() => {
        if (!activeMapLibraryFilter) return memories.filter(memory => !memory.deletedAt);
        if (activeMapLibraryFilter.type === 'custom') {
            return memories.filter(memory =>
                (memory.customFolderIds ?? []).includes(activeMapLibraryFilter.id)
            );
        }
        return memories.filter(memory =>
            !memory.deletedAt &&
            !memory.excludeFromCountryFolder &&
            (memory.country || 'Unknown Location') === activeMapLibraryFilter.name
        );
    }, [memories, activeMapLibraryFilter]);

    const visibleSharedMemories = useMemo(() => {
        if (!activeMapLibraryFilter) return sharedLibraryMemories;
        if (activeMapLibraryFilter.type === 'custom') {
            return sharedLibraryMemories.filter(memory =>
                (memory.customFolderIds ?? []).includes(activeMapLibraryFilter.id)
            );
        }
        return sharedLibraryMemories.filter(memory =>
            !memory.excludeFromCountryFolder &&
            (memory.country || 'Unknown Location') === activeMapLibraryFilter.name
        );
    }, [sharedLibraryMemories, activeMapLibraryFilter]);

    useEffect(() => {
        returnToStartingPoint();
    }, [returnToStartingPoint]);

    const { focusLat, focusLng } = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();

    useEffect(() => {
        if (!focusLat || !focusLng) return;
        const lat = parseFloat(focusLat);
        const lng = parseFloat(focusLng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            jumpToLocation(lat, lng);
        }
    }, [focusLat, focusLng, jumpToLocation]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-slate-50">
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    return (
        <View className="flex-1 items-center bg-slate-50">
            <TouchableOpacity
                onPress={() => {
                    Keyboard.dismiss();
                    settingsSheetRef.current?.open();
                }}
                style={styles.menuButton}
            >
                <Ionicons name="menu" size={30} color="#3B82F6" />
            </TouchableOpacity>

            <SearchBar
                showSearchBar={showSearchBar}
                searchQuery={searchQuery}
                searchResults={searchResults}
                fetchPlaces={fetchPlaces}
                onClearSearch={handleClearSearch}
                handleSelectPlace={handleSelectPlace}
            />

            <View className="h-full w-full rounded-3xl overflow-hidden shadow-lg border-white">
                <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    customMapStyle={isDarkMode ? darkMapStyle : undefined}
                    style={{ flex: 1 }}
                    onPanDrag={() => setMapMoved(true)}
                    onPress={Keyboard.dismiss}
                    showsUserLocation={true}
                    // @ts-ignore
                    userTrackingMode="followWithHeading"
                    showsCompass={true}
                    rotateEnabled={true}
                    showsUserLocationHeading={true}
                    showsPointsOfInterest={true}
                    initialRegion={{
                        latitude: location?.coords.latitude || 32.0853,
                        longitude: location?.coords.longitude || 34.7818,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >
                    <Marker
                        coordinate={{
                            latitude: destinationLatitude || 0.0001,
                            longitude: destinationLongitude || 0.0001,
                        }}
                        title="Destination"
                        description={searchQuery}
                        pinColor="gold"
                        opacity={destinationLatitude !== 0 && userChoseAddress && !isPlaceAlreadySaved ? 1 : 0}
                    />

                    {showMemories &&
                        visibleOwnedMemories
                            .filter((m) => isValidMapCoordinate(m.latitude, m.longitude))
                            .map((memory, index) => (
                                <MapMemoryMarker
                                    key={`owned-${markerRenderVersion}-${memory.id}`}
                                    memory={memory}
                                    variant="owned"
                                    index={index}
                                    onMarkerPress={handleMarkerPress}
                                />
                            ))}

                    {showMemories &&
                        visibleSharedMemories
                            .filter((m) => isValidMapCoordinate(m.latitude, m.longitude))
                            .map((memory, index) => (
                                <MapMemoryMarker
                                    key={`shared-${markerRenderVersion}-${memory.id}`}
                                    memory={memory}
                                    variant="shared"
                                    index={index}
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

                <View style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 100 }}>
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
                                className="h-[40px] w-[100px] bg-blue-600 rounded-2xl items-center justify-center shadow-lg"
                            >
                                <Text className="text-white font-bold text-lg">Route</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={addSelectedPlaceAsMemory}
                                disabled={isAddingPlace}
                                className="h-[40px] w-[150px] bg-green-500 rounded-2xl items-center justify-center shadow-lg"
                                style={{ opacity: isAddingPlace ? 0.7 : 1 }}
                            >
                                {isAddingPlace ? (
                                    <ActivityIndicator size="small" color="white" />
                                ) : (
                                    <Text className="text-white font-bold text-lg">Add to Memories</Text>
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
                    <View style={{ position: 'absolute', bottom: 80, left: 30, zIndex: 100 }}>
                        <View className="h-[45px] w-[150px] bg-white p-3 rounded-3xl shadow-sm border border-slate-100 items-center justify-center">
                            <Text className="text-slate-600 font-bold">🚶 {routeDistance} walk</Text>
                        </View>
                    </View>
                ) : null}

                {mapMoved && (
                    <TouchableOpacity
                        onPress={() => {
                            returnToStartingPoint();
                            setMapMoved(false);
                        }}
                        style={styles.recenterButton}
                    >
                        <Ionicons name="locate" size={24} color="#1d4ed8" />
                    </TouchableOpacity>
                )}
            </View>

            <MemoActionsSheet
                visible={selectedMemoryForActions !== null}
                memory={selectedMemoryForActions}
                onClose={closeMemoActions}
                onOpenInfo={handleOpenInfoFromActions}
                onStartWalkingRoute={() => {
                    void handleWalkToMemo();
                }}
                onOpenDrivingRoute={handleDriveToMemo}
                onShare={handleShareMemoFromActions}
                onDelete={handleDeleteMemoFromActions}
                deleteLabel="Delete"
            />

            <LibraryModal
                visible={isGalleryVisible}
                onClose={() => setIsGalleryVisible(false)}
                memories={memories}
                sharedLibraryMemories={sharedLibraryMemories}
                customFolders={customFolders}
                createCustomFolder={createCustomFolder}
                removeLibrary={removeLibrary}
                shareCustomFolder={shareCustomFolder}
                grantLibraryEditAccess={grantLibraryEditAccess}
                addPlaceMemory={addPlaceMemory}
                toggleMemoryInCustomFolder={toggleMemoryInCustomFolder}
                updateCustomFolderCover={updateCustomFolderCover}
                jumpToLocation={jumpToLocation}
                onShowFolderOnMap={handleShowFolderOnMap}
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
                shareEmail={shareEmail}
                setShareEmail={setShareEmail}
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
                setShowMemories={setShowMemories}
                onOpenGallery={() => setIsGalleryVisible(true)}
                onOpenMarketplace={() => setIsMarketplaceVisible(true)}
                onOpenInvites={() => {
                    settingsSheetRef.current?.close();
                    setIsInvitesVisible(true);
                }}
                onLogout={() => {
                    auth.logout();
                    router.replace('/');
                }}
            />

            <InvitesModal visible={isInvitesVisible} onClose={() => setIsInvitesVisible(false)} />
            <MarketPlaceModal
                visible={isMarketplaceVisible}
                onClose={() => setIsMarketplaceVisible(false)}
                userId={auth.user?.id}
                customFolders={customFolders}
                memories={memories}
                reloadMemories={reloadMemories}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    menuButton: {
        position: 'absolute',
        top: 70,
        right: 18,
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 12,
        elevation: 10,
        zIndex: 1000,
    },
    markerContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    markerPinWrapper: {
        alignItems: 'center',
    },
    markerAvatarOuter: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 3,
        backgroundColor: 'white',
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
    recenterButton: {
        position: 'absolute',
        bottom: 50,
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
