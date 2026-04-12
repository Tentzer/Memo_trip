import {
    View,
    ActivityIndicator,
    Text,
    TouchableOpacity,
    TextInput,
    Image,
    Switch,
    StyleSheet, Modal, SafeAreaView, FlatList, Keyboard,
    Pressable,
    Alert,
} from 'react-native';
import MapView, {PROVIDER_GOOGLE, Marker, Polyline} from 'react-native-maps';
import React, {useEffect, useState, useRef, useMemo} from 'react';
import {Ionicons} from '@expo/vector-icons';
import {router} from "expo-router";
import { type Memory, useMemories } from '@/context/MemoryContext';
import { useMapLogic } from '@/hooks/useMapLogic';
import { useAuth } from '@/context/AuthContext';
import BottomSheet, {BottomSheetBackdrop, BottomSheetView} from '@gorhom/bottom-sheet';
import { Image as ExpoImage } from 'expo-image';
import { getCountryPhoto } from '@/lib/countryPhotos';

type LibraryFolder = {
    id: string;
    name: string;
    type: 'country' | 'custom';
    memoCount: number;
    owner_id?: string;
    role?: 'owner' | 'editor' | 'viewer';
    isShared?: boolean;
};

export default function MapScreen() {
    const {
        memories,
        customFolders,
        deleteMemory,
        handleShareSubmit,
        shareCustomFolder,
        removeLibrary,
        createCustomFolder,
        toggleMemoryInCustomFolder,
        updateMemoryInfo,
        getLibraryMemories,
    } = useMemories();
    const auth = useAuth();
    const [selectedFolder, setSelectedFolder] = useState<LibraryFolder | null>(null);
    const [isCreateFolderVisible, setIsCreateFolderVisible] = useState(false);
    const [isAddToFolderVisible, setIsAddToFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [selectedMemoryForInfo, setSelectedMemoryForInfo] = useState<Memory | null>(null);
    const [memoTitle, setMemoTitle] = useState('');
    const [memoDescription, setMemoDescription] = useState('');
    const [isShareLibraryVisible, setIsShareLibraryVisible] = useState(false);
    const [libraryShareEmail, setLibraryShareEmail] = useState('');
    const [isLibraryActionsVisible, setIsLibraryActionsVisible] = useState(false);

    const openMemoInfo = (memory: Memory) => {
        setSelectedMemoryForInfo(memory);
        setMemoTitle(memory.title ?? '');
        setMemoDescription(memory.description ?? '');
        setIsInfoModalVisible(true);
    };

    const closeMemoInfo = () => {
        Keyboard.dismiss();
        setIsInfoModalVisible(false);
        setSelectedMemoryForInfo(null);
        setMemoTitle('');
        setMemoDescription('');
    };

    const handleSaveMemoInfo = async () => {
        if (!selectedMemoryForInfo) {
            return;
        }

        await updateMemoryInfo(selectedMemoryForInfo.id, memoTitle, memoDescription);
        closeMemoInfo();
    };

    const {
        mapRef, location, loading, searchQuery, google_result,isDarkMode,
        destination_latitue, destination_longtitude, route_coordinates,
        show_route, show_SearchingBar, map_Moved, userChooseAdress, routeDistance,showMemories,isGalleryVisible,isShareMemoryVisible,shareEmail,memoryToShare,
        setSearchQuery, setMapMoved, fetchPlaces, handleSelectPlace,setShareEmail,
        GetPlaceRoute, openDrivingInWaze, handleMarkerPress, returnToStartingPoint,setIsShareMemoryVisible,setIsDarkMode,
        setShowRoute, setShowSearchingBar, setUserChooseAdress, setRouteDistance , setDestinationlongtitude, setDestinationlatitue,setShowMemories,setIsGalleryVisible,
        jumpToLocation,
    } = useMapLogic(deleteMemory, openMemoInfo);

    const bottomSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['45%'], []);
    const renderBackdrop = (props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    );

    const sortedMemories = useMemo(
        () =>
            [...memories].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ),
        [memories]
    );

    const countryFolders = useMemo(() => {
        const folderCounts = new Map<string, number>();

        sortedMemories.forEach(memory => {
            if (memory.excludeFromCountryFolder) {
                return;
            }
            const countryName = memory.country || 'Unknown Location';
            folderCounts.set(countryName, (folderCounts.get(countryName) || 0) + 1);
        });

        return Array.from(folderCounts.entries())
            .map(([name, memoCount]) => ({
                id: `country-${name.toLowerCase()}`,
                name,
                type: 'country' as const,
                memoCount,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [sortedMemories]);

    const customLibraryFolders = useMemo(
        () =>
            [...customFolders]
                .map(folder => ({
                    id: folder.id,
                    name: folder.name,
                    type: 'custom' as const,
                    owner_id: folder.owner_id,
                    role: folder.role,
                    isShared: folder.isShared,
                    memoCount: getLibraryMemories(folder.id).length,
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [customFolders, getLibraryMemories]
    );

    const libraryFolders = useMemo(
        () => [...countryFolders, ...customLibraryFolders],
        [countryFolders, customLibraryFolders]
    );

    const selectedFolderMemories = useMemo(() => {
        if (!selectedFolder) {
            return [];
        }

        if (selectedFolder.type === 'country') {
            return sortedMemories.filter(
                memory =>
                    !memory.excludeFromCountryFolder
                    && (memory.country || 'Unknown Location') === selectedFolder.name
            );
        }

        return getLibraryMemories(selectedFolder.id);
    }, [getLibraryMemories, selectedFolder, sortedMemories]);

    const canManageSelectedFolder = selectedFolder?.type === 'custom'
        && selectedFolder.role === 'owner';
    const canShareSelectedFolder = selectedFolder?.type === 'custom' && selectedFolder.role === 'owner';

    const closeLibrary = () => {
        Keyboard.dismiss();
        setSelectedFolder(null);
        setIsCreateFolderVisible(false);
        setIsAddToFolderVisible(false);
        setIsLibraryActionsVisible(false);
        setNewFolderName('');
        setIsGalleryVisible(false);
        setIsShareLibraryVisible(false);
        setLibraryShareEmail('');
    };

    const handleCreateFolder = async () => {
        const result = await createCustomFolder(newFolderName);

        if (!result.success) {
            Alert.alert('Folder not created', result.message || 'Please try again.');
            return;
        }

        setNewFolderName('');
        setIsCreateFolderVisible(false);
    };

    const handleRemoveSelectedLibrary = () => {
        if (!selectedFolder || selectedFolder.type !== 'custom') {
            return;
        }

        const actionLabel = selectedFolder.role === 'owner' ? 'Delete' : 'Remove';
        const message = selectedFolder.role === 'owner'
            ? 'This will remove the library from your account. If other users still have access, the library will stay available for them.'
            : 'This will remove the shared library from your account only.';

        Alert.alert(
            `${actionLabel} Library`,
            message,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: actionLabel,
                    style: 'destructive',
                    onPress: async () => {
                        const result = await removeLibrary(selectedFolder.id);

                        if (!result.success) {
                            Alert.alert('Library not removed', result.message || 'Please try again.');
                            return;
                        }

                        setIsAddToFolderVisible(false);
                        setIsLibraryActionsVisible(false);
                        setIsShareLibraryVisible(false);
                        setLibraryShareEmail('');
                        setSelectedFolder(null);
                    },
                },
            ]
        );
    };

    useEffect(() => {
        returnToStartingPoint();
    }, [returnToStartingPoint]);

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-slate-50">
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    return (
        <View className="flex-1 items-center bg-slate-50">

            {/*My settings button*/}
            <TouchableOpacity
                onPress={() => bottomSheetRef.current?.expand()}
                style={localStyles.menuButton}
            >
                <Ionicons name="menu" size={30} color="#3B82F6" />
            </TouchableOpacity>



            <View className="absolute top-5 px-5 left-0 right-0 z-50">
                {/*Searching bar*/}
                {show_SearchingBar && (
                    <View className=" flex-row items-center bg-white h-12 rounded-2xl px-4 shadow-lg
                    " style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 10,
                        elevation: 2,
                    }}>
                        {/* Search Icon */}
                        <View className="absolute left-4 mt-2">
                            <Ionicons name="search" size={20} color="#64748b"/>
                        </View>

                        {/* The Input Field */}
                        <TextInput
                            className="flex-1 text-align text-slate-800 font-medium ml-10"
                            placeholder="Where to next, Traveler?"
                            placeholderTextColor="#94a3b8"
                            value={searchQuery}
                            onChangeText={fetchPlaces}
                            returnKeyType="search"
                        />

                        {/* Clear Button*/}
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={20} color="#cbd5e1"/>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Drop DOWN!! */}
                {google_result.length > 0 && (
                    <View className="bg-white mt-2 rounded-2xl shadow-xl overflow-hidden">
                        {
                            google_result.map((item: any) => (
                                <TouchableOpacity
                                    key={item.place_id}
                                    className="p-4 border-b border-slate-100 active:bg-slate-50"
                                    onPress={() =>{handleSelectPlace(item.place_id , item.description) ; setUserChooseAdress(true)}}
                                ><Text className="text-slate-800">{item.description}</Text></TouchableOpacity>
                            ))}
                    </View>
                )}
            </View>


            {/* 1. Wrap the map in a container with a fixed height */}
            <View className="  h-full w-full rounded-3xl overflow-hidden shadow-lg border-white  ">

                <MapView

                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    customMapStyle={isDarkMode ? darkMapStyle : []}
                    style={{flex: 1}}
                    onPanDrag={() => setMapMoved(true)}
                    showsUserLocation={true}
                    // @ts-ignore
                    userTrackingMode="followWithHeading"
                    onMapReady={() => {
                        console.log("Map is ready, checking heading...");
                    }}
                    showsCompass={true}          // Shows compass only when map is rotated
                    rotateEnabled={true}         // MUST be true for the cone to appear
                    showsUserLocationHeading={true} // <--- Specific prop for the blue cone beam!
                    showsPointsOfInterest={true}
                    initialRegion={{
                        latitude: location?.coords.latitude || 32.0853,
                        longitude: location?.coords.longitude || 34.7818,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >

                    {/* 1. SEARCH DESTINATION MARKER */}
                    {destination_latitue !== 0 && userChooseAdress && (
                        <Marker
                            coordinate={{
                                latitude: destination_latitue,
                                longitude: destination_longtitude,
                            }}
                            title="Destination"
                            description={searchQuery}
                            anchor={{ x: 0.5, y: 1 }}
                        >
                            <View
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Ionicons name="location" size={34} color="#facc15" />
                            </View>
                        </Marker>
                    )}

                    {showMemories && memories.map((memory, index) => {
                        const rotation = (index % 2 === 0 ? 2 : -2);

                        return (
                            <Marker
                                key={memory.id}
                                coordinate={{
                                    latitude: memory.latitude,
                                    longitude: memory.longitude,
                                }}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    handleMarkerPress(memory);
                                }}
                            >
                                <TouchableOpacity
                                    onPress={() => handleMarkerPress(memory)}
                                >
                                    <View
                                        style={{
                                            transform: [{ rotate: `${rotation}deg` }],
                                            shadowColor: "#000",
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 4,
                                            elevation: 5,
                                        }}
                                        className="p-1 pb-4 bg-white border border-gray-200"
                                    >
                                        <Image
                                            source={{ uri: memory.uri }}
                                            className="w-14 h-14 bg-gray-100"
                                            resizeMode="cover"
                                        />
                                    </View>
                                </TouchableOpacity>
                            </Marker>
                        );
                    })}

                    {route_coordinates?.length && show_route && (
                        <Polyline
                            coordinates={route_coordinates}
                            strokeColor="#3B82F6"
                            strokeWidth={4}
                            lineCap="round"            // THIS turns the squares into circles
                            lineJoin="round"
                            lineDashPattern={[8, 15]} // 10px line, 10px gap
                            // Remove lineCap="round" for sharp dashes
                        />
                    )}
                </MapView>


                {/* LEFT SIDE FLOATING BUTTONS */}
                <View style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 100 }}>
                    {userChooseAdress && !show_route && (
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
                                                GetPlaceRoute();
                                                setShowRoute(true);
                                                returnToStartingPoint();
                                                setShowSearchingBar(false);
                                            },
                                        },
                                        {
                                            text: 'Drive with Waze',
                                            onPress: () => {
                                                openDrivingInWaze();
                                            },
                                        },
                                    ]
                                );
                            }}
                            className="h-[40px] w-[100px] bg-blue-600 rounded-2xl items-center justify-center shadow-lg"
                        >
                            <Text className="text-white font-bold text-lg">Route</Text>
                        </TouchableOpacity>
                    )}

                    {show_route && (
                        <TouchableOpacity
                            onPress={() => {
                                setShowRoute(false);
                                returnToStartingPoint();
                                setShowSearchingBar(true);
                                setRouteDistance('');
                                setDestinationlatitue(0);
                                setDestinationlongtitude(0);
                                setUserChooseAdress(false);
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

                {/* RIGHT SIDE RECENTER BUTTON */}
                {map_Moved && (
                    <TouchableOpacity
                        onPress={() => {
                            returnToStartingPoint();
                            setMapMoved(false);
                        }}
                        style={{
                            position: 'absolute',
                            bottom: 108,
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
                        }}
                    >
                        <Ionicons name="locate" size={24} color="#1d4ed8" />
                    </TouchableOpacity>
                )}
            </View>

            <Modal
                animationType="slide"
                transparent={false}
                visible={isGalleryVisible}
                onRequestClose={closeLibrary}
            >
                <SafeAreaView style={{ flex: 1, backgroundColor: '#eef4ff' }}>
                    <View
                        style={{
                            paddingHorizontal: 16,
                            paddingTop: 8,
                            paddingBottom: 14,
                            backgroundColor: '#eef4ff',
                        }}
                    >
                        <View
                            style={{
                                minHeight: 68,
                                justifyContent: 'center',
                                alignItems: 'center',
                                position: 'relative',
                            }}
                        >
                            {selectedFolder ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsAddToFolderVisible(false);
                                        setIsLibraryActionsVisible(false);
                                        setIsShareLibraryVisible(false);
                                        setLibraryShareEmail('');
                                        setSelectedFolder(null);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        width: 42,
                                        height: 42,
                                        borderRadius: 21,
                                        backgroundColor: 'rgba(255,255,255,0.92)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: '#d7e2f2',
                                        shadowColor: '#0f172a',
                                        shadowOpacity: 0.08,
                                        shadowRadius: 8,
                                        elevation: 2,
                                    }}
                                >
                                    <Ionicons name="chevron-back" size={22} color="#2563eb" />
                                </TouchableOpacity>
                            ) : null}
                            <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 56 }}>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        fontSize: selectedFolder ? 28 : 26,
                                        fontWeight: '800',
                                        color: '#1e3a8a',
                                        textAlign: 'center',
                                    }}
                                >
                                    {selectedFolder ? selectedFolder.name : 'My Memos'}
                                </Text>
                                <Text style={{ fontSize: 13, color: '#5b6b85', marginTop: 4, textAlign: 'center' }}>
                                    {selectedFolder
                                        ? `${selectedFolder.memoCount} memo${selectedFolder.memoCount === 1 ? '' : 's'}`
                                        : 'Browse automatic country folders and your own collections.'}
                                </Text>
                            </View>

                            {selectedFolder?.type === 'custom' ? (
                                <View
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        top: 12,
                                        alignItems: 'flex-end',
                                    }}
                                >
                                    <TouchableOpacity
                                        onPress={() => {
                                            setIsLibraryActionsVisible((previous) => {
                                                const next = !previous;
                                                if (!next) {
                                                    setIsAddToFolderVisible(false);
                                                    setIsShareLibraryVisible(false);
                                                    setLibraryShareEmail('');
                                                }
                                                return next;
                                            });
                                        }}
                                        style={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: 21,
                                            backgroundColor: 'rgba(255,255,255,0.92)',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 1,
                                            borderColor: '#d7e2f2',
                                            shadowColor: '#0f172a',
                                            shadowOpacity: 0.08,
                                            shadowRadius: 8,
                                            elevation: 2,
                                        }}
                                    >
                                        <Ionicons name="settings-outline" size={20} color="#334155" />
                                    </TouchableOpacity>
                                    {isLibraryActionsVisible ? (
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                                                borderRadius: 999,
                                                paddingHorizontal: 8,
                                                paddingVertical: 6,
                                                gap: 6,
                                                marginTop: 8,
                                            }}
                                        >
                                            {canManageSelectedFolder ? (
                                                <TouchableOpacity
                                                    onPress={() => setIsAddToFolderVisible(prev => !prev)}
                                                    style={{
                                                        backgroundColor: isAddToFolderVisible ? '#047857' : '#065F46',
                                                        borderRadius: 999,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 7,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                    }}
                                                >
                                                    <Ionicons name="add" size={15} color="white" />
                                                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                                                        Add
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : null}
                                            {canShareSelectedFolder ? (
                                                <TouchableOpacity
                                                    onPress={() => setIsShareLibraryVisible(previous => !previous)}
                                                    style={{
                                                        backgroundColor: isShareLibraryVisible ? '#1e40af' : '#1d4ed8',
                                                        borderRadius: 999,
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 7,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                    }}
                                                >
                                                    <Ionicons name="share-social-outline" size={15} color="white" />
                                                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                                                        Share
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : null}
                                            <TouchableOpacity
                                                onPress={handleRemoveSelectedLibrary}
                                                style={{
                                                    backgroundColor: '#dc2626',
                                                    borderRadius: 999,
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 7,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                <Ionicons name="trash-outline" size={15} color="white" />
                                                <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>
                                                    {selectedFolder.role === 'owner' ? 'Delete' : 'Remove'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}
                                </View>
                            ) : !selectedFolder ? (
                                <TouchableOpacity
                                    onPress={closeLibrary}
                                    style={{
                                        position: 'absolute',
                                        right: 0,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: 'rgba(255,255,255,0.92)',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: '#d7e2f2',
                                    }}
                                >
                                    <Ionicons name="close" size={22} color="#64748b" />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </View>

                    {!selectedFolder ? (
                        <FlatList
                            data={libraryFolders}
                            numColumns={2}
                            key="folder-grid"
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
                            ListHeaderComponent={
                                <View
                                    style={{
                                        backgroundColor: 'white',
                                        borderRadius: 20,
                                        padding: 18,
                                        marginBottom: 14,
                                        shadowColor: '#000',
                                        shadowOpacity: 0.06,
                                        shadowRadius: 10,
                                        elevation: 2,
                                    }}
                                >
                                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#0f172a' }}>
                                        Library View
                                    </Text>
                                    <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
                                        Every memo is grouped automatically by the country where it was captured.
                                        Create extra folders like Food, Friends, or Museums and add memos to them.
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setIsCreateFolderVisible(prev => !prev)}
                                        style={{
                                            marginTop: 16,
                                            alignSelf: 'flex-start',
                                            backgroundColor: '#065F46',
                                            paddingHorizontal: 16,
                                            paddingVertical: 10,
                                            borderRadius: 14,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <Ionicons name="add-circle-outline" size={18} color="white" />
                                        <Text style={{ color: 'white', fontWeight: '700' }}>
                                            {isCreateFolderVisible ? 'Hide Creator' : 'Create Folder'}
                                        </Text>
                                    </TouchableOpacity>
                                    {isCreateFolderVisible ? (
                                        <View
                                            style={{
                                                marginTop: 16,
                                                borderWidth: 1,
                                                borderColor: '#dbe4ea',
                                                borderRadius: 18,
                                                padding: 16,
                                                backgroundColor: '#f8fafc',
                                            }}
                                        >
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                                New Custom Folder
                                            </Text>
                                            <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 20 }}>
                                                Create folders like Food, Museums, or Friends and then add memos to them.
                                            </Text>
                                            <TextInput
                                                style={{
                                                    marginTop: 14,
                                                    height: 48,
                                                    borderWidth: 1,
                                                    borderColor: '#cbd5e1',
                                                    borderRadius: 14,
                                                    paddingHorizontal: 14,
                                                    backgroundColor: 'white',
                                                    color: '#0f172a',
                                                }}
                                                placeholder="Folder name"
                                                placeholderTextColor="#94a3b8"
                                                value={newFolderName}
                                                onChangeText={setNewFolderName}
                                                returnKeyType="done"
                                                onSubmitEditing={handleCreateFolder}
                                            />
                                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                                <TouchableOpacity
                                                    onPress={handleCreateFolder}
                                                    style={{
                                                        backgroundColor: '#065F46',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 11,
                                                        borderRadius: 14,
                                                    }}
                                                >
                                                    <Text style={{ color: 'white', fontWeight: '700' }}>Save Folder</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        Keyboard.dismiss();
                                                        setIsCreateFolderVisible(false);
                                                        setNewFolderName('');
                                                    }}
                                                    style={{
                                                        backgroundColor: '#e2e8f0',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 11,
                                                        borderRadius: 14,
                                                    }}
                                                >
                                                    <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : null}
                                </View>
                            }
                            ListEmptyComponent={
                                <View
                                    style={{
                                        backgroundColor: 'white',
                                        borderRadius: 20,
                                        padding: 24,
                                        alignItems: 'center',
                                    }}
                                >
                                    <Ionicons name="images-outline" size={36} color="#94a3b8" />
                                    <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#0f172a' }}>
                                        No memos yet
                                    </Text>
                                    <Text style={{ marginTop: 6, color: '#64748b', textAlign: 'center' }}>
                                        Take your first photo and it will appear in a country folder automatically.
                                    </Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsAddToFolderVisible(false);
                                        setIsLibraryActionsVisible(false);
                                        setIsShareLibraryVisible(false);
                                        setLibraryShareEmail('');
                                        setSelectedFolder(item);
                                    }}
                                    style={localStyles.libraryFolderCard}
                                >
                                    {item.type === 'country' ? (
                                        <View style={localStyles.countryFolderBackground}>
                                            <ExpoImage
                                                source={getCountryPhoto(item.name)}
                                                style={localStyles.countryFolderImage}
                                                contentFit="cover"
                                                cachePolicy="memory-disk"
                                                transition={0}
                                            />
                                            <View style={localStyles.countryFolderOverlay} />
                                            <View style={localStyles.countryFolderContent}>
                                                <Text style={localStyles.countryFolderTitle} numberOfLines={2}>
                                                    {item.name}
                                                </Text>
                                                <Text style={localStyles.countryFolderCount}>
                                                    {item.memoCount} memo{item.memoCount === 1 ? '' : 's'}
                                                </Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={localStyles.customFolderContent}>
                                            <View style={localStyles.customFolderIcon}>
                                                <Ionicons
                                                    name="folder-open"
                                                    size={24}
                                                    color="#1d4ed8"
                                                />
                                            </View>
                                            <Text
                                                style={localStyles.customFolderTitle}
                                                numberOfLines={2}
                                            >
                                                {item.name}
                                            </Text>
                                            <Text style={localStyles.customFolderCount}>
                                                {item.memoCount} memo{item.memoCount === 1 ? '' : 's'}
                                            </Text>
                                            <Text style={localStyles.customFolderLabel}>
                                                {item.isShared ? 'Shared library' : 'Custom folder'}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <View style={{ flex: 1 }}>
                            {selectedFolder.type === 'custom' ? (
                                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                    {isShareLibraryVisible && canShareSelectedFolder ? (
                                        <View
                                            style={{
                                                marginTop: 14,
                                                backgroundColor: 'white',
                                                borderRadius: 20,
                                                padding: 14,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.06,
                                                shadowRadius: 10,
                                                elevation: 2,
                                            }}
                                        >
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                                Share {selectedFolder.name}
                                            </Text>
                                            <Text style={{ color: '#64748b', marginTop: 4 }}>
                                                Invite another MemoTrip user to open this library without duplicating the JPG files.
                                            </Text>
                                            <TextInput
                                                value={libraryShareEmail}
                                                onChangeText={setLibraryShareEmail}
                                                placeholder="User's email"
                                                placeholderTextColor="#94a3b8"
                                                autoCapitalize="none"
                                                keyboardType="email-address"
                                                className="h-12 border border-gray-200 rounded-xl px-4 text-slate-800 font-medium mt-4"
                                                returnKeyType="send"
                                            />
                                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                                <TouchableOpacity
                                                    onPress={async () => {
                                                        await shareCustomFolder(libraryShareEmail.trim(), selectedFolder.id);
                                                        setIsShareLibraryVisible(false);
                                                        setLibraryShareEmail('');
                                                    }}
                                                    style={{
                                                        backgroundColor: '#1d4ed8',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 11,
                                                        borderRadius: 14,
                                                    }}
                                                >
                                                    <Text style={{ color: 'white', fontWeight: '700' }}>Send Invite</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        setIsShareLibraryVisible(false);
                                                        setLibraryShareEmail('');
                                                    }}
                                                    style={{
                                                        backgroundColor: '#e2e8f0',
                                                        paddingHorizontal: 16,
                                                        paddingVertical: 11,
                                                        borderRadius: 14,
                                                    }}
                                                >
                                                    <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : null}
                                    {isAddToFolderVisible ? (
                                        <View
                                            style={{
                                                marginTop: 14,
                                                backgroundColor: 'white',
                                                borderRadius: 20,
                                                padding: 14,
                                                shadowColor: '#000',
                                                shadowOpacity: 0.06,
                                                shadowRadius: 10,
                                                elevation: 2,
                                            }}
                                        >
                                            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                                Add photos to {selectedFolder.name}
                                            </Text>
                                            <Text style={{ color: '#64748b', marginTop: 4 }}>
                                                Tap Add or Remove to manage this library.
                                            </Text>
                                            <FlatList
                                                data={sortedMemories}
                                                keyExtractor={(item) => `picker-${item.id}`}
                                                style={{ marginTop: 12, maxHeight: 320 }}
                                                nestedScrollEnabled
                                                ListEmptyComponent={
                                                    <View
                                                        style={{
                                                            paddingVertical: 24,
                                                            alignItems: 'center',
                                                        }}
                                                    >
                                                        <Ionicons name="camera-outline" size={32} color="#94a3b8" />
                                                        <Text style={{ marginTop: 10, color: '#64748b', textAlign: 'center' }}>
                                                            Take a photo first, then you can place it in this library.
                                                        </Text>
                                                    </View>
                                                }
                                                ItemSeparatorComponent={() => (
                                                    <View
                                                        style={{
                                                            height: 1,
                                                            backgroundColor: '#e2e8f0',
                                                            marginVertical: 10,
                                                        }}
                                                    />
                                                )}
                                                renderItem={({ item }) => {
                                                    const isInCustomFolder = item.customFolderIds.includes(selectedFolder.id);

                                                    return (
                                                        <View
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                            }}
                                                        >
                                                            <Image
                                                                source={{ uri: item.uri }}
                                                                style={{
                                                                    width: 62,
                                                                    height: 62,
                                                                    borderRadius: 16,
                                                                    backgroundColor: '#e2e8f0',
                                                                }}
                                                            />
                                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                                <Text
                                                                    style={{
                                                                        fontSize: 15,
                                                                        fontWeight: '700',
                                                                        color: '#0f172a',
                                                                    }}
                                                                >
                                                                    {item.country || 'Unknown Location'}
                                                                </Text>
                                                                <Text style={{ color: '#64748b', marginTop: 4 }}>
                                                                    {new Date(item.created_at).toLocaleDateString()}
                                                                </Text>
                                                            </View>
                                                            <TouchableOpacity
                                                                onPress={() =>
                                                                    toggleMemoryInCustomFolder(item.id, selectedFolder.id)
                                                                }
                                                                style={{
                                                                    backgroundColor: isInCustomFolder ? '#dcfce7' : '#dbeafe',
                                                                    paddingHorizontal: 14,
                                                                    paddingVertical: 10,
                                                                    borderRadius: 14,
                                                                }}
                                                            >
                                                                <Text
                                                                    style={{
                                                                        color: isInCustomFolder ? '#166534' : '#1d4ed8',
                                                                        fontWeight: '700',
                                                                    }}
                                                                >
                                                                    {isInCustomFolder ? 'Remove' : 'Add'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    );
                                                }}
                                            />
                                        </View>
                                    ) : null}
                                </View>
                            ) : null}

                            <FlatList
                                data={selectedFolderMemories}
                                numColumns={3}
                                key={`memo-grid-${selectedFolder.id}`}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={{
                                    paddingHorizontal: 10,
                                    paddingBottom: 24,
                                    paddingTop: 0,
                                }}
                                ListEmptyComponent={
                                    <View
                                        style={{
                                            marginTop: 60,
                                            marginHorizontal: 12,
                                            backgroundColor: 'white',
                                            borderRadius: 20,
                                            padding: 24,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Ionicons name="folder-open-outline" size={38} color="#94a3b8" />
                                        <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#0f172a' }}>
                                            This folder is empty
                                        </Text>
                                        <Text style={{ marginTop: 6, color: '#64748b', textAlign: 'center' }}>
                                            {selectedFolder.type === 'country'
                                                ? 'New photos taken in this country will appear here automatically.'
                                                : 'Use Add Memos to place photos inside this library.'}
                                        </Text>
                                    </View>
                                }
                                renderItem={({ item, index }) => {
                                    const rotation = (index % 2 === 0 ? 1 : -1) * 2;
                                    return (
                                        <TouchableOpacity
                                            onPress={() => {
                                                closeLibrary();
                                                jumpToLocation(item.latitude, item.longitude);
                                            }}
                                            style={{ flex: 1 / 3, padding: 8 }}
                                        >
                                            <View
                                                style={{
                                                    transform: [{ rotate: `${rotation}deg` }],
                                                    backgroundColor: 'white',
                                                    padding: 4,
                                                    paddingBottom: 12,
                                                    shadowColor: "#000",
                                                    shadowOpacity: 0.1,
                                                    elevation: 3,
                                                }}
                                            >
                                                <Image
                                                    source={{ uri: item.uri }}
                                                    style={{ width: '100%', aspectRatio: 1 }}
                                                    resizeMode="cover"
                                                />
                                                {item.title ? (
                                                    <Text
                                                        numberOfLines={1}
                                                        style={{
                                                            fontSize: 10,
                                                            color: '#0f172a',
                                                            textAlign: 'center',
                                                            fontWeight: '700',
                                                            marginTop: 6,
                                                            paddingHorizontal: 4,
                                                        }}
                                                    >
                                                        {item.title}
                                                    </Text>
                                                ) : null}
                                                <Text
                                                    style={{
                                                        fontSize: 8,
                                                        color: '#c2410c',
                                                        textAlign: 'center',
                                                        marginTop: item.title ? 2 : 4,
                                                    }}
                                                >
                                                    {item.created_at
                                                        ? new Date(item.created_at).toLocaleDateString()
                                                        : 'Recent'}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                    )}
                </SafeAreaView>
            </Modal>

            <Modal
                visible={isInfoModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={closeMemoInfo}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                        style={{
                            flex: 1,
                            justifyContent: 'center',
                            alignItems: 'center',
                            width: '100%',
                            paddingHorizontal: 24,
                        }}
                        onPress={Keyboard.dismiss}
                        accessible={false}
                    >
                        <View style={{ width: '100%', maxWidth: 420, backgroundColor: 'white', borderRadius: 24, padding: 24 }}>
                            <Text style={{ fontSize: 22, fontWeight: '700', color: '#0f172a' }}>Memo Info</Text>
                            <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
                                Give this memo a name and an optional description for your library.
                            </Text>

                            <TextInput
                                value={memoTitle}
                                onChangeText={setMemoTitle}
                                placeholder="Memo name"
                                placeholderTextColor="#94a3b8"
                                maxLength={60}
                                className="h-12 border border-gray-200 rounded-xl px-4 text-slate-800 font-medium mt-5"
                                returnKeyType="next"
                            />

                            <TextInput
                                value={memoDescription}
                                onChangeText={setMemoDescription}
                                placeholder="Description (optional)"
                                placeholderTextColor="#94a3b8"
                                multiline={true}
                                textAlignVertical="top"
                                style={{
                                    minHeight: 120,
                                    borderWidth: 1,
                                    borderColor: '#e5e7eb',
                                    borderRadius: 16,
                                    paddingHorizontal: 16,
                                    paddingVertical: 14,
                                    color: '#0f172a',
                                    marginTop: 14,
                                }}
                            />

                            <TouchableOpacity
                                onPress={handleSaveMemoInfo}
                                className="mt-6 p-4 bg-emerald-700 rounded-xl items-center shadow-sm"
                            >
                                <Text className="text-white font-bold text-base">Save Info</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={closeMemoInfo}
                                className="mt-4 p-3 bg-gray-100 rounded-xl items-center"
                            >
                                <Text className="text-gray-600 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </View>
            </Modal>

            <Modal
                visible={isShareMemoryVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsShareMemoryVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                        style={{
                            flex: 1,
                            justifyContent: 'center', // Centers vertically
                            alignItems: 'center'      // Centers horizontally
                        }}
                        onPress={Keyboard.dismiss}
                        accessible={false}
                    >
                    <View className="bg-white p-6 rounded-2xl w-80">
                        <Text className="text-lg font-bold">Share Memory</Text>
                        <TextInput
                            className="h-12 border border-gray-200 rounded-xl px-4 text-slate-800 font-medium mt-4"
                            placeholder="User's Email"
                            placeholderTextColor="#94a3b8"
                            value={shareEmail}
                            onChangeText={setShareEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            returnKeyType="send"
                        />
                        <TouchableOpacity
                            onPress={async () => {
                                setIsShareMemoryVisible(false);
                                setShareEmail('');
                                await handleShareSubmit(shareEmail,memoryToShare)

                            }}
                            className="mt-6 p-4 bg-blue-600 rounded-xl items-center shadow-sm"
                        >
                            <Text className="text-white font-bold text-base">Share Memory</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setIsShareMemoryVisible(false)}
                            className="mt-4 p-3 bg-gray-100 rounded-xl items-center"
                        >
                            <Text className="text-gray-600 font-semibold">Cancel</Text>
                        </TouchableOpacity>
                    </View>
                    </Pressable>
                </View>
            </Modal>
            {/* 2. BottomSheet Implementation */}
            <BottomSheet
                ref={bottomSheetRef}
                index={-1} // Starts closed
                snapPoints={snapPoints}
                enablePanDownToClose={true} // This makes it a "Slider"
                backdropComponent={renderBackdrop}
                handleIndicatorStyle={{ backgroundColor: '#cbd5e1', width: 40 }}
                backgroundStyle={{ backgroundColor: 'white', borderRadius: 30 }}
            >
                <BottomSheetView style={{ padding: 25, paddingBottom: 50 }}>

                    {/* Header */}
                    <View style={localStyles.menuHeader}>
                        <Text style={localStyles.menuTitle}>Settings</Text>
                    </View>

                    {/* Dark Mode Row */}
                    <View style={localStyles.menuRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Ionicons name={isDarkMode ? "moon" : "sunny"} size={24} color="#735e21" />
                            <Text style={localStyles.menuText}>Dark Mode</Text>
                        </View>
                        <Switch
                            trackColor={{ false: "#767577", true: "#735e21" }}
                            onValueChange={() => setIsDarkMode(prev => !prev)}
                            value={isDarkMode}
                        />
                    </View>

                    {/* Memo Saves Row */}
                    <View style={localStyles.menuRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Ionicons name="image" size={24} color="#228B22" />
                            <Text style={localStyles.menuText}>Memo Saves</Text>
                        </View>
                        <Switch
                            trackColor={{ false: "#767577", true: "#735e21" }}
                            onValueChange={() => setShowMemories(prev => !prev)}
                            value={showMemories}
                        />
                    </View>

                    {/* Memo Pics (Gallery) Row */}
                    <TouchableOpacity
                        onPress={() => {
                            bottomSheetRef.current?.close();
                            setTimeout(() => setIsGalleryVisible(true), 400);
                        }}
                        style={localStyles.menuRow}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Ionicons name="images" size={24} color="#065F46" />
                            <Text style={localStyles.menuText}>My Memos</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    {/* Logout Row */}
                    <TouchableOpacity
                        style={localStyles.menuRow}
                        onPress={() => {
                            bottomSheetRef.current?.close();
                            auth.logout();
                            router.replace('/');
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
                            <Text style={localStyles.menuText}>Logout</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Account Row */}
                    <TouchableOpacity
                        style={[localStyles.menuRow, { borderBottomWidth: 0 }]}
                        onPress={() => alert("Coming soon!")}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Ionicons name="person-circle-outline" size={24} color="#3B82F6" />
                            <Text style={localStyles.menuText}>Account</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                    </TouchableOpacity>

                </BottomSheetView>
            </BottomSheet>


        </View>
    );
}


const localStyles = StyleSheet.create({
    libraryFolderCard: {
        flex: 1,
        margin: 6,
        borderRadius: 22,
        minHeight: 170,
        overflow: 'hidden',
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
    },
    countryFolderBackground: {
        flex: 1,
        minHeight: 170,
        justifyContent: 'center',
        position: 'relative',
    },
    countryFolderImage: {
        ...StyleSheet.absoluteFillObject,
    },
    countryFolderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.35)',
    },
    countryFolderContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 18,
    },
    countryFolderTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: 'white',
        textAlign: 'center',
        textShadowColor: 'rgba(15, 23, 42, 0.45)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    countryFolderCount: {
        marginTop: 8,
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.92)',
        letterSpacing: 0.3,
    },
    customFolderContent: {
        flex: 1,
        padding: 18,
        justifyContent: 'center',
    },
    customFolderIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#dbeafe',
        alignItems: 'center',
        justifyContent: 'center',
    },
    customFolderTitle: {
        marginTop: 16,
        fontSize: 17,
        fontWeight: '700',
        color: '#0f172a',
    },
    customFolderCount: {
        marginTop: 6,
        color: '#64748b',
    },
    customFolderLabel: {
        marginTop: 10,
        color: '#94a3b8',
        fontSize: 12,
    },
    menuButton: {
        position: 'absolute',
        top: 70,
        right: 18, // Opposite side of the search bar or toggle
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 12,
        elevation: 10,
        zIndex: 1000,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end', // This makes it slide up from the bottom
        backgroundColor: 'rgba(0,0,0,0.4)', // Dim the background
    },
    menuContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 25,
        paddingBottom: 50,
        minHeight: 250,
    },
    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    menuTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    menuText: {
        fontSize: 16,
        color: '#334155',
        fontWeight: '500',
    }
});

const darkMapStyle = [
    {
        "featureType": "all",
        "elementType": "all",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels",
        "stylers": [
            {
                "color": "white",
                "visibility": "on"
            },
            {
                "saturation": "-100"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "saturation": 36
            },
            {
                "color": "#000000"
            },
            {
                "lightness": 40
            },
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "color": "white",
                "visibility": "on"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "all",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 17
            },
            {
                "weight": 1.2
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "landscape.natural",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "lightness": 21
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#4d6059"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
            {
                "visibility": "on"
            },
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            },
            {
                "lightness": 29
            },
            {
                "weight": 0.2
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 18
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#7f8d89"
            }
        ]
    },
    {
        "featureType": "transit",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#000000"
            },
            {
                "lightness": 19
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "all",
        "stylers": [
            {
                "color": "#2b3638"
            },
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#2b3638"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#24282b"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#24282b"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    },
    {
        "featureType": "water",
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "on"
            }
        ]
    }
];