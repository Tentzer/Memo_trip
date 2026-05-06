import { type CustomFolder, type Memory } from '@/context/MemoryContext';
import { getCountryPhoto } from '@/lib/countryPhotos';
import {
    fetchGooglePlaceDetails,
    fetchGooglePlacePredictions,
    type GooglePlaceDetails,
    type PlacePrediction,
} from '@/lib/googlePlaces';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    FlatList,
    Keyboard,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';

type LibraryFolder = {
    id: string;
    name: string;
    type: 'country' | 'custom';
    memoCount: number;
    owner_id?: string;
    role?: 'owner' | 'viewer' | 'editor';
    isShared?: boolean;
    coverImageUrl?: string | null;
};

type AddMemosTab = 'saved' | 'search';

const PLACEHOLDER_URL = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
const UNKNOWN_LOCATION = 'Unknown Location';

interface Props {
    visible: boolean;
    onClose: () => void;
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    customFolders: CustomFolder[];
    createCustomFolder: (name: string) => Promise<{ success: boolean; message?: string }>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    shareCustomFolder: (email: string, folderId: string) => Promise<void>;
    grantLibraryEditAccess: (email: string, folderId: string) => Promise<void>;
    addPlaceMemory: (
        photoUri: string,
        lat: number,
        lng: number,
        country: string,
        description?: string,
        title?: string,
        options?: { customFolderIds?: string[] }
    ) => Promise<void>;
    toggleMemoryInCustomFolder: (memoryId: string, folderId: string) => Promise<void>;
    updateCustomFolderCover: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    jumpToLocation: (lat: number, lng: number) => void;
    onShowFolderOnMap: (folderId: string, folderType: 'country' | 'custom', folderName: string) => void;
}

export default function LibraryModal({
    visible,
    onClose,
    memories,
    sharedLibraryMemories,
    customFolders,
    createCustomFolder,
    removeLibrary,
    shareCustomFolder,
    grantLibraryEditAccess,
    addPlaceMemory,
    toggleMemoryInCustomFolder,
    updateCustomFolderCover,
    jumpToLocation,
    onShowFolderOnMap,
}: Props) {
    const [selectedFolder, setSelectedFolder] = useState<LibraryFolder | null>(null);
    const [previousSelectedFolder, setPreviousSelectedFolder] = useState<LibraryFolder | null>(null);
    const [isCreateFolderVisible, setIsCreateFolderVisible] = useState(false);
    const [isAddToFolderVisible, setIsAddToFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isShareLibraryVisible, setIsShareLibraryVisible] = useState(false);
    const [libraryShareEmail, setLibraryShareEmail] = useState('');
    const [isGrantAccessVisible, setIsGrantAccessVisible] = useState(false);
    const [grantAccessEmail, setGrantAccessEmail] = useState('');
    const [isLibraryActionsVisible, setIsLibraryActionsVisible] = useState(false);
    const [addMemosTab, setAddMemosTab] = useState<AddMemosTab>('saved');
    const [libraryPlaceSearchQuery, setLibraryPlaceSearchQuery] = useState('');
    const [libraryPlaceSearchResults, setLibraryPlaceSearchResults] = useState<PlacePrediction[]>([]);
    const [selectedLibraryPlace, setSelectedLibraryPlace] = useState<GooglePlaceDetails | null>(null);
    const [isSearchingLibraryPlaces, setIsSearchingLibraryPlaces] = useState(false);
    const [isAddingLibraryPlace, setIsAddingLibraryPlace] = useState(false);
    const { width: windowWidth } = useWindowDimensions();
    const libraryActionsBarWidth = Math.max(200, windowWidth - 88);
    const folderViewAnimation = useRef(new Animated.Value(1)).current;
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    useEffect(() => {
        if (!selectedFolder) return;

        folderViewAnimation.setValue(0);
        Animated.timing(folderViewAnimation, {
            toValue: 1,
            duration: 360,
            useNativeDriver: true,
        }).start();
    }, [folderViewAnimation, selectedFolder]);

    const folderViewAnimatedStyle = useMemo(
        () => ({
            opacity: folderViewAnimation,
            transform: [
                {
                    translateY: folderViewAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [28, 0],
                    }),
                },
            ],
        }),
        [folderViewAnimation]
    );

    useEffect(() => {
        if (!visible) {
            setSelectedFolder(null);
            setPreviousSelectedFolder(null);
            setIsCreateFolderVisible(false);
            setIsAddToFolderVisible(false);
            setIsLibraryActionsVisible(false);
            setNewFolderName('');
            setIsShareLibraryVisible(false);
            setLibraryShareEmail('');
            setIsGrantAccessVisible(false);
            setGrantAccessEmail('');
            setAddMemosTab('saved');
            setLibraryPlaceSearchQuery('');
            setLibraryPlaceSearchResults([]);
            setSelectedLibraryPlace(null);
            setIsSearchingLibraryPlaces(false);
            setIsAddingLibraryPlace(false);
        }
    }, [visible]);

    const visiblePersonalMemories = useMemo(
        () => memories.filter(memory => !memory.deletedAt),
        [memories]
    );

    const sortedVisibleMemories = useMemo(
        () =>
            [...visiblePersonalMemories].sort(
                (a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0)
            ),
        [visiblePersonalMemories]
    );

    const libraryMemoriesByCustomFolder = useMemo(() => {
        const foldersByMemory = new Map<string, Memory>();
        [...visiblePersonalMemories, ...sharedLibraryMemories.filter(memory => !memory.deletedAt)].forEach(memory => {
            foldersByMemory.set(memory.id, memory);
        });

        const map = new Map<string, Memory[]>();
        foldersByMemory.forEach(memory => {
            memory.customFolderIds.forEach(folderId => {
                const existing = map.get(folderId);
                if (existing) existing.push(memory);
                else map.set(folderId, [memory]);
            });
        });

        map.forEach((folderMemories, folderId) => {
            map.set(
                folderId,
                folderMemories.sort(
                    (a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0)
                )
            );
        });

        return map;
    }, [sharedLibraryMemories, visiblePersonalMemories]);

    // Pre-built index so selecting a country folder is O(1) instead of O(N).
    const memoriesByCountry = useMemo(() => {
        const map = new Map<string, Memory[]>();
        sortedVisibleMemories.forEach(m => {
            if (m.excludeFromCountryFolder) return;
            const key = m.country || 'Unknown Location';
            const existing = map.get(key);
            if (existing) existing.push(m);
            else map.set(key, [m]);
        });
        return map;
    }, [sortedVisibleMemories]);

    const countryFolders = useMemo(() => {
        const folderCounts = new Map<string, number>();
        const relatedCountryNames = new Set<string>();

        sortedVisibleMemories.forEach(memory => {
            if (memory.excludeFromCountryFolder) return;
            const countryName = memory.country || 'Unknown Location';
            folderCounts.set(countryName, (folderCounts.get(countryName) || 0) + 1);
        });

        customFolders.forEach(folder => {
            libraryMemoriesByCustomFolder.get(folder.id)?.forEach(memory => {
                const countryName = memory.country || UNKNOWN_LOCATION;
                if (countryName !== UNKNOWN_LOCATION) {
                    relatedCountryNames.add(countryName);
                }
            });
        });

        const countryNames = new Set([...folderCounts.keys(), ...relatedCountryNames]);
        const folders = Array.from(countryNames)
            .map(name => ({
                id: `country-${name.toLowerCase()}`,
                name,
                type: 'country' as const,
                memoCount: folderCounts.get(name) ?? 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return folders;
    }, [customFolders, libraryMemoriesByCustomFolder, sortedVisibleMemories]);

    const customLibraryFolders = useMemo(
        () => {
            const folders = [...customFolders]
                .map(folder => ({
                    id: folder.id,
                    name: folder.name,
                    type: 'custom' as const,
                    owner_id: folder.owner_id,
                    role: folder.role,
                    isShared: folder.isShared,
                    coverImageUrl: folder.coverImageUrl,
                    memoCount: libraryMemoriesByCustomFolder.get(folder.id)?.length ?? 0,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return folders;
        },
        [customFolders, libraryMemoriesByCustomFolder]
    );

    const libraryFolders = useMemo(
        () => [...countryFolders, ...customLibraryFolders],
        [countryFolders, customLibraryFolders]
    );

    const selectedFolderMemories = useMemo(() => {
        if (!selectedFolder) return [];

        if (selectedFolder.type === 'country') {
            return memoriesByCountry.get(selectedFolder.name) ?? [];
        }

        return libraryMemoriesByCustomFolder.get(selectedFolder.id) ?? [];
    }, [selectedFolder, memoriesByCountry, libraryMemoriesByCustomFolder]);

    const countrySubFolders = useMemo(() => {
        if (!selectedFolder || selectedFolder.type !== 'country') return [];

        const customLibraryFolderToMemoNumberMap = new Map<string, number>();

        customLibraryFolders.forEach(folder => {
            const matchingCountryMemoCount = (libraryMemoriesByCustomFolder.get(folder.id) ?? []).filter(
                memory => {
                    const countryName = memory.country || UNKNOWN_LOCATION;
                    return countryName !== UNKNOWN_LOCATION && countryName === selectedFolder.name;
                }
            ).length;

            if (matchingCountryMemoCount > 0) {
                customLibraryFolderToMemoNumberMap.set(
                    folder.id,
                    matchingCountryMemoCount
                );
            }
        });

        return customLibraryFolders
            .filter(folder => customLibraryFolderToMemoNumberMap.has(folder.id))
            .map(folder => ({
                ...folder,
                memoCount: customLibraryFolderToMemoNumberMap.get(folder.id) || 0,
            }));
    }, [customLibraryFolders, libraryMemoriesByCustomFolder, selectedFolder]);

    const libraryManageMemories = useMemo(() => {
        if (selectedFolder?.type !== 'custom') {
            return sortedVisibleMemories;
        }

        const mergedById = new Map<string, Memory>();
        [...sortedVisibleMemories, ...(libraryMemoriesByCustomFolder.get(selectedFolder.id) ?? [])].forEach(memory => {
            mergedById.set(memory.id, memory);
        });

        return Array.from(mergedById.values()).sort(
            (a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0)
        );
    }, [selectedFolder, sortedVisibleMemories, libraryMemoriesByCustomFolder]);

    const selectedCustomFolder = useMemo(
        () => (
            selectedFolder?.type === 'custom'
                ? customFolders.find(folder => folder.id === selectedFolder.id) ?? null
                : null
        ),
        [customFolders, selectedFolder]
    );

    const canChangeCover = selectedCustomFolder?.role === 'owner';
    const canAddMemosToFolder =
        selectedCustomFolder?.role === 'owner' || selectedCustomFolder?.role === 'editor';
    const canShareSelectedFolder = selectedCustomFolder?.role === 'owner';
    const canGrantEditAccess = selectedCustomFolder?.role === 'owner';

    const clearLibraryPlaceSearch = useCallback(() => {
        setLibraryPlaceSearchQuery('');
        setLibraryPlaceSearchResults([]);
        setSelectedLibraryPlace(null);
    }, []);

    const fetchLibraryPlaces = useCallback(async (text: string) => {
        setLibraryPlaceSearchQuery(text);
        setSelectedLibraryPlace(null);

        if (text.length < 3) {
            setLibraryPlaceSearchResults([]);
            return;
        }

        setIsSearchingLibraryPlaces(true);
        try {
            const predictions = await fetchGooglePlacePredictions(text, GOOGLE_API_KEY);
            setLibraryPlaceSearchResults(predictions);
        } catch (error) {
            console.error('Library place search failed:', error);
            Alert.alert('Search failed', 'Could not search places right now.');
        } finally {
            setIsSearchingLibraryPlaces(false);
        }
    }, [GOOGLE_API_KEY]);

    const handleSelectLibraryPlace = useCallback(async (placeId: string, description: string) => {
        setIsSearchingLibraryPlaces(true);
        try {
            const place = await fetchGooglePlaceDetails(placeId, description, GOOGLE_API_KEY);

            if (!place) {
                Alert.alert('Place not found', 'Could not load this place.');
                return;
            }

            setSelectedLibraryPlace(place);
            setLibraryPlaceSearchQuery(description);
            setLibraryPlaceSearchResults([]);
            Keyboard.dismiss();
        } catch (error) {
            console.error('Library place details failed:', error);
            Alert.alert('Place not found', 'Could not load this place.');
        } finally {
            setIsSearchingLibraryPlaces(false);
        }
    }, [GOOGLE_API_KEY]);

    const handleAddSelectedPlaceToLibrary = useCallback(async () => {
        if (!selectedFolder || selectedFolder.type !== 'custom' || !selectedLibraryPlace) return;

        const photoUri = selectedLibraryPlace.photoReference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${selectedLibraryPlace.photoReference}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_URL;

        setIsAddingLibraryPlace(true);
        try {
            await addPlaceMemory(
                photoUri,
                selectedLibraryPlace.latitude,
                selectedLibraryPlace.longitude,
                selectedLibraryPlace.country ?? '',
                undefined,
                selectedLibraryPlace.title,
                { customFolderIds: [selectedFolder.id] }
            );
            Alert.alert('Place added', `${selectedLibraryPlace.title.split(',')[0].trim()} was added to ${selectedFolder.name}.`);
            clearLibraryPlaceSearch();
            setAddMemosTab('saved');
        } catch (error) {
            console.error('Library place save failed:', error);
            Alert.alert('Library not updated', 'The place was saved to your memos, but could not be added to this library.');
        } finally {
            setIsAddingLibraryPlace(false);
        }
    }, [
        selectedFolder,
        selectedLibraryPlace,
        GOOGLE_API_KEY,
        addPlaceMemory,
        clearLibraryPlaceSearch,
    ]);

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        onClose();
    }, [onClose]);

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
        if (!selectedFolder || selectedFolder.type !== 'custom') return;

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
                        setIsGrantAccessVisible(false);
                        setGrantAccessEmail('');
                        setSelectedFolder(null);
                    },
                },
            ]
        );
    };

    const handleUpdateSelectedLibraryCover = async () => {
        if (!selectedFolder || selectedFolder.type !== 'custom') return;

        const result = await updateCustomFolderCover(selectedFolder.id);
        if (!result.success && result.message) {
            Alert.alert('Cover not updated', result.message);
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={visible}
            onRequestClose={handleClose}
        >
            <SafeAreaView style={{ flex: 1, backgroundColor: '#eef4ff' }}>
                {/* Header */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerInner}>
                        {selectedFolder ? (
                            <TouchableOpacity
                                onPress={() => {
                                    setIsAddToFolderVisible(false);
                                    setIsLibraryActionsVisible(false);
                                    setIsShareLibraryVisible(false);
                                    setLibraryShareEmail('');
                                    setIsGrantAccessVisible(false);
                                    setGrantAccessEmail('');
                                    startTransition(() => {
                                        if (previousSelectedFolder) {
                                            setSelectedFolder(previousSelectedFolder);
                                            setPreviousSelectedFolder(null);
                                        } else {
                                            setSelectedFolder(null);
                                        }
                                    });
                                }}
                                style={styles.backButton}
                            >
                                <Ionicons name="chevron-back" size={22} color="#2563eb" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={22} color="#2563eb" />
                            </TouchableOpacity>
                        )}

                        {selectedFolder?.type === 'custom' ? (
                            <View style={styles.actionsContainer}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsLibraryActionsVisible(previous => {
                                            const next = !previous;
                                            if (!next) {
                                                setIsAddToFolderVisible(false);
                                                setIsShareLibraryVisible(false);
                                                setLibraryShareEmail('');
                                                setIsGrantAccessVisible(false);
                                                setGrantAccessEmail('');
                                            }
                                            return next;
                                        });
                                    }}
                                    style={styles.iconButton}
                                >
                                    <Ionicons name="settings-outline" size={20} color="#334155" />
                                </TouchableOpacity>
                                {isLibraryActionsVisible ? (
                                    <View style={[styles.actionsRow, { maxWidth: libraryActionsBarWidth }]}>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            keyboardShouldPersistTaps="handled"
                                            style={{ flexGrow: 0, maxWidth: libraryActionsBarWidth }}
                                            contentContainerStyle={styles.actionsRowScrollContent}
                                        >
                                        {canChangeCover ? (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    void handleUpdateSelectedLibraryCover();
                                                }}
                                                style={[styles.actionChip, { backgroundColor: '#7c3aed' }]}
                                            >
                                                <Ionicons name="image-outline" size={15} color="white" />
                                                <Text style={styles.actionChipText}>Cover</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {canShareSelectedFolder ? (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsGrantAccessVisible(false);
                                                    setGrantAccessEmail('');
                                                    setIsAddToFolderVisible(false);
                                                    setIsShareLibraryVisible(prev => !prev);
                                                }}
                                                style={[styles.actionChip, { backgroundColor: isShareLibraryVisible ? '#1e40af' : '#1d4ed8' }]}
                                            >
                                                <Ionicons name="share-social-outline" size={15} color="white" />
                                                <Text style={styles.actionChipText}>Share</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {canGrantEditAccess ? (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsShareLibraryVisible(false);
                                                    setLibraryShareEmail('');
                                                    setIsAddToFolderVisible(false);
                                                    setIsGrantAccessVisible(prev => !prev);
                                                }}
                                                style={[styles.actionChip, { backgroundColor: isGrantAccessVisible ? '#b45309' : '#d97706' }]}
                                            >
                                                <Ionicons name="person-add-outline" size={15} color="white" />
                                                <Text style={styles.actionChipText}>Grant</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        <TouchableOpacity
                                            onPress={handleRemoveSelectedLibrary}
                                            style={[styles.actionChip, { backgroundColor: '#dc2626' }]}
                                        >
                                            <Ionicons name="trash-outline" size={15} color="white" />
                                            <Text style={styles.actionChipText}>
                                                {selectedFolder.role === 'owner' ? 'Delete' : 'Remove'}
                                            </Text>
                                        </TouchableOpacity>
                                        </ScrollView>
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        {!selectedFolder ? (
                            <TouchableOpacity
                                onPress={() => setIsCreateFolderVisible(prev => !prev)}
                                style={[styles.createFolderButton, styles.headerCreateFolderButton]}
                            >
                                <Ionicons name="add-circle-outline" size={18} color="white" />
                                <Text style={{ color: 'white', fontWeight: '700' }}>
                                    {isCreateFolderVisible ? 'Hide' : 'Create Folder'}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Body */}
                {!selectedFolder ? (
                    <FlatList
                        data={libraryFolders}
                        numColumns={2}
                        key="folder-grid"
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
                        ListHeaderComponent={
                            isCreateFolderVisible ? (
                                <View style={styles.infoCard}>
                                    <View style={styles.createFolderForm}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                            New Custom Folder
                                        </Text>
                                        <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 20 }}>
                                            Create folders like Food, Museums, or Friends and then add memos to them.
                                        </Text>
                                        <TextInput
                                            style={styles.folderNameInput}
                                            placeholder="Folder name"
                                            placeholderTextColor="#94a3b8"
                                            value={newFolderName}
                                            onChangeText={setNewFolderName}
                                            returnKeyType="done"
                                            onSubmitEditing={handleCreateFolder}
                                        />
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                            <TouchableOpacity onPress={handleCreateFolder} style={styles.primaryButton}>
                                                <Text style={{ color: 'white', fontWeight: '700' }}>Save Folder</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    Keyboard.dismiss();
                                                    setIsCreateFolderVisible(false);
                                                    setNewFolderName('');
                                                }}
                                                style={styles.secondaryButton}
                                            >
                                                <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ) : null
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyCard}>
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
                                    setIsGrantAccessVisible(false);
                                    setGrantAccessEmail('');
                                    startTransition(() => {
                                        setSelectedFolder(item);
                                    });
                                }}
                                style={styles.folderCard}
                            >
                                {item.type === 'country' ? (
                                    <View style={styles.countryFolderBackground}>
                                        <ExpoImage
                                            source={getCountryPhoto(item.name)}
                                            style={StyleSheet.absoluteFillObject}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            transition={0}
                                        />
                                        <View style={styles.countryFolderOverlay} />
                                        <View style={styles.countryFolderContent}>
                                            <Text style={styles.countryFolderTitle} numberOfLines={2}>
                                                {item.name}
                                            </Text>
                                            <Text style={styles.countryFolderCount}>
                                                {item.memoCount} memo{item.memoCount === 1 ? '' : 's'}
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    item.coverImageUrl ? (
                                        <View style={styles.customFolderBackground}>
                                            <ExpoImage
                                                source={{ uri: item.coverImageUrl }}
                                                style={StyleSheet.absoluteFillObject}
                                                contentFit="cover"
                                                cachePolicy="memory-disk"
                                            />
                                            <View style={styles.customFolderOverlay} />
                                            <View style={styles.customFolderCoverContent}>
                                                <Text style={styles.customFolderCoverTitle} numberOfLines={2}>
                                                    {item.name}
                                                </Text>
                                                <Text style={styles.customFolderCoverCount}>
                                                    {item.memoCount} memo{item.memoCount === 1 ? '' : 's'}
                                                </Text>
                                                <View style={styles.sharedLibraryCoverLabelRow}>
                                                    {item.isShared ? <View style={styles.sharedLibraryCoverDot} /> : null}
                                                    <Text style={styles.customFolderCoverLabel}>
                                                        {item.isShared ? 'Shared library' : 'Custom folder'}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={styles.customFolderContent}>
                                            <View style={styles.customFolderIcon}>
                                                <Ionicons name="folder-open" size={24} color="#1d4ed8" />
                                            </View>
                                            <Text style={styles.customFolderTitle} numberOfLines={2}>
                                                {item.name}
                                            </Text>
                                            <Text style={styles.customFolderCount}>
                                                {item.memoCount} memo{item.memoCount === 1 ? '' : 's'}
                                            </Text>
                                            <View style={styles.sharedLibraryLabelRow}>
                                                {item.isShared ? <View style={styles.sharedLibraryDot} /> : null}
                                                <Text style={styles.customFolderLabel}>
                                                    {item.isShared ? 'Shared library' : 'Custom folder'}
                                                </Text>
                                            </View>
                                        </View>
                                    )
                                )}
                            </TouchableOpacity>
                        )}
                    />
                ) : (
                    <Animated.View style={[styles.selectedFolderView, folderViewAnimatedStyle]}>
                        {selectedFolder.type === 'custom' ? (
                            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                {isShareLibraryVisible && canShareSelectedFolder ? (
                                    <View style={styles.panelCard}>
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
                                                style={styles.sendInviteButton}
                                            >
                                                <Text style={{ color: 'white', fontWeight: '700' }}>Send Invite</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsShareLibraryVisible(false);
                                                    setLibraryShareEmail('');
                                                }}
                                                style={styles.secondaryButton}
                                            >
                                                <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : null}

                                {isGrantAccessVisible && canGrantEditAccess ? (
                                    <View style={styles.panelCard}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                            Grant edit access for {selectedFolder.name}
                                        </Text>
                                        <Text style={{ color: '#64748b', marginTop: 4 }}>
                                            Let one of your friends add memos to this library.
                                        </Text>
                                        <TextInput
                                            value={grantAccessEmail}
                                            onChangeText={setGrantAccessEmail}
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
                                                    await grantLibraryEditAccess(grantAccessEmail.trim(), selectedFolder.id);
                                                    setIsGrantAccessVisible(false);
                                                    setGrantAccessEmail('');
                                                }}
                                                style={styles.sendInviteButton}
                                            >
                                                <Text style={{ color: 'white', fontWeight: '700' }}>Grant access</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsGrantAccessVisible(false);
                                                    setGrantAccessEmail('');
                                                }}
                                                style={styles.secondaryButton}
                                            >
                                                <Text style={{ color: '#475569', fontWeight: '700' }}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : null}

                                {isAddToFolderVisible ? (
                                    <View style={styles.panelCard}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                                            Add photos to {selectedFolder.name}
                                        </Text>
                                        <Text style={{ color: '#64748b', marginTop: 4 }}>
                                            Add saved memos or search Google Maps for a new place.
                                        </Text>
                                        <View style={styles.addMemosTabs}>
                                            <TouchableOpacity
                                                onPress={() => setAddMemosTab('saved')}
                                                style={[
                                                    styles.addMemosTab,
                                                    addMemosTab === 'saved' ? styles.addMemosTabActive : null,
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.addMemosTabText,
                                                    addMemosTab === 'saved' ? styles.addMemosTabTextActive : null,
                                                ]}>
                                                    Saved Memos
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => setAddMemosTab('search')}
                                                style={[
                                                    styles.addMemosTab,
                                                    addMemosTab === 'search' ? styles.addMemosTabActive : null,
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.addMemosTabText,
                                                    addMemosTab === 'search' ? styles.addMemosTabTextActive : null,
                                                ]}>
                                                    Search Place
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {addMemosTab === 'saved' ? (
                                            <FlatList
                                                data={libraryManageMemories}
                                                keyExtractor={(item) => `picker-${item.id}`}
                                                style={{ marginTop: 12, maxHeight: 320 }}
                                                nestedScrollEnabled
                                                ListEmptyComponent={
                                                    <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                                                        <Ionicons name="camera-outline" size={32} color="#94a3b8" />
                                                        <Text style={{ marginTop: 10, color: '#64748b', textAlign: 'center' }}>
                                                            Take a photo first, then you can place it in this library.
                                                        </Text>
                                                    </View>
                                                }
                                                ItemSeparatorComponent={() => (
                                                    <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 }} />
                                                )}
                                                renderItem={({ item }) => {
                                                    const isInCustomFolder = item.customFolderIds.includes(
                                                        selectedFolder.id
                                                    );
                                                    const displayTitle = (item.title || item.country || 'Unknown Location')
                                                        .split(',')[0]
                                                        .trim() || 'Unknown Location';
                                                    return (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            <ExpoImage
                                                                source={{ uri: item.uri }}
                                                                style={{ width: 62, height: 62, borderRadius: 16, backgroundColor: '#e2e8f0' }}
                                                                contentFit="cover"
                                                                cachePolicy="memory-disk"
                                                            />
                                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                                <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                                                                    {displayTitle}
                                                                </Text>
                                                                <Text style={{ color: '#64748b', marginTop: 4 }}>
                                                                    {new Date(item.created_at).toLocaleDateString()}
                                                                </Text>
                                                            </View>
                                                            <TouchableOpacity
                                                                onPress={() => toggleMemoryInCustomFolder(item.id, selectedFolder.id)}
                                                                style={[
                                                                    styles.addRemoveButton,
                                                                    { backgroundColor: isInCustomFolder ? '#dcfce7' : '#dbeafe' },
                                                                ]}
                                                            >
                                                                <Text style={{ color: isInCustomFolder ? '#166534' : '#1d4ed8', fontWeight: '700' }}>
                                                                    {isInCustomFolder ? 'Remove' : 'Add'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    );
                                                }}
                                            />
                                        ) : (
                                            <View style={styles.libraryPlaceSearchContainer}>
                                                <View style={styles.libraryPlaceSearchInputRow}>
                                                    <Ionicons name="search" size={18} color="#64748b" />
                                                    <TextInput
                                                        value={libraryPlaceSearchQuery}
                                                        onChangeText={fetchLibraryPlaces}
                                                        placeholder="Search Google Maps"
                                                        placeholderTextColor="#94a3b8"
                                                        returnKeyType="search"
                                                        style={styles.libraryPlaceSearchInput}
                                                    />
                                                    {libraryPlaceSearchQuery.length > 0 ? (
                                                        <TouchableOpacity onPress={clearLibraryPlaceSearch}>
                                                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </View>

                                                {isSearchingLibraryPlaces ? (
                                                    <Text style={styles.libraryPlaceSearchHint}>Searching places...</Text>
                                                ) : null}

                                                {libraryPlaceSearchResults.length > 0 ? (
                                                    <View style={styles.libraryPlaceResults}>
                                                        {libraryPlaceSearchResults.map((place) => (
                                                            <TouchableOpacity
                                                                key={place.place_id}
                                                                onPress={() => handleSelectLibraryPlace(place.place_id, place.description)}
                                                                style={styles.libraryPlaceResultItem}
                                                            >
                                                                <Text style={styles.libraryPlaceResultTitle}>
                                                                    {place.structured_formatting?.main_text ?? place.description}
                                                                </Text>
                                                                {place.structured_formatting?.secondary_text ? (
                                                                    <Text style={styles.libraryPlaceResultSubtitle}>
                                                                        {place.structured_formatting.secondary_text}
                                                                    </Text>
                                                                ) : null}
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                ) : null}

                                                {selectedLibraryPlace ? (
                                                    <View style={styles.selectedLibraryPlaceCard}>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.selectedLibraryPlaceTitle}>
                                                                {selectedLibraryPlace.title.split(',')[0].trim() || selectedLibraryPlace.title}
                                                            </Text>
                                                            <Text style={styles.selectedLibraryPlaceSubtitle}>
                                                                {selectedLibraryPlace.country || 'Unknown Location'}
                                                            </Text>
                                                        </View>
                                                        <TouchableOpacity
                                                            onPress={handleAddSelectedPlaceToLibrary}
                                                            disabled={isAddingLibraryPlace}
                                                            style={[
                                                                styles.addPlaceToLibraryButton,
                                                                isAddingLibraryPlace ? { opacity: 0.6 } : null,
                                                            ]}
                                                        >
                                                            <Text style={styles.addPlaceToLibraryButtonText}>
                                                                {isAddingLibraryPlace ? 'Adding...' : 'Add'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : (
                                                    <Text style={styles.libraryPlaceSearchHint}>
                                                        Pick a Google Maps result, then add it directly to this library.
                                                    </Text>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        {selectedFolder.type === 'country' && countrySubFolders.length > 0 ? (
                            <View style={styles.countrySubFoldersSection}>
                                <Text style={styles.countrySubFoldersTitle}>
                                    Related libraries
                                </Text>
                                <FlatList
                                    data={countrySubFolders}
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    keyExtractor={(item) => `country-subfolder-${item.id}`}
                                    contentContainerStyle={styles.countrySubFoldersList}
                                    ItemSeparatorComponent={() => <View style={styles.countrySubFolderSeparator} />}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsAddToFolderVisible(false);
                                                setIsLibraryActionsVisible(false);
                                                setIsShareLibraryVisible(false);
                                                setLibraryShareEmail('');
                                                setIsGrantAccessVisible(false);
                                                setGrantAccessEmail('');
                                                startTransition(() => {
                                                    setPreviousSelectedFolder(selectedFolder);
                                                    setSelectedFolder(item);
                                                });
                                            }}
                                            style={styles.countrySubFolderCard}
                                        >
                                            {item.coverImageUrl ? (
                                                <ExpoImage
                                                    source={{ uri: item.coverImageUrl }}
                                                    style={styles.countrySubFolderCover}
                                                    contentFit="cover"
                                                    cachePolicy="memory-disk"
                                                />
                                            ) : (
                                                <View style={styles.countrySubFolderFallback}>
                                                    <Ionicons name="folder-open" size={26} color="white" />
                                                </View>
                                            )}
                                            <View style={styles.countrySubFolderOverlay} />
                                            <View style={styles.countrySubFolderTitleContainer}>
                                                <Text style={styles.countrySubFolderName} numberOfLines={2}>
                                                    {item.name}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        ) : null}

                        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                            {canAddMemosToFolder ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsShareLibraryVisible(false);
                                        setLibraryShareEmail('');
                                        setIsGrantAccessVisible(false);
                                        setGrantAccessEmail('');
                                        setIsAddToFolderVisible(prev => {
                                            const next = !prev;
                                            if (!next) {
                                                setAddMemosTab('saved');
                                                clearLibraryPlaceSearch();
                                            }
                                            return next;
                                        });
                                    }}
                                    style={[
                                        styles.showOnMapButton,
                                        {
                                            backgroundColor: isAddToFolderVisible ? '#047857' : '#065F46',
                                            marginBottom: 10,
                                        },
                                    ]}
                                >
                                    <Ionicons name="add" size={17} color="white" />
                                    <Text style={styles.showOnMapButtonText}>Add Memos</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                                onPress={() => {
                                    if (selectedFolderMemories.length === 0) {
                                        Alert.alert('No memos yet', 'This folder has no memos to show on the map.');
                                        return;
                                    }
                                    onShowFolderOnMap(selectedFolder.id, selectedFolder.type, selectedFolder.name);
                                    handleClose();
                                }}
                                style={styles.showOnMapButton}
                            >
                                <Ionicons name="map-outline" size={17} color="white" />
                                <Text style={styles.showOnMapButtonText}>Show on map</Text>
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={selectedFolderMemories}
                            numColumns={3}
                            key={`memo-grid-${selectedFolder.id}`}
                            keyExtractor={(item) => item.id}
                            initialNumToRender={8}
                            maxToRenderPerBatch={8}
                            windowSize={5}
                            contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 24, paddingTop: 0 }}
                            ListEmptyComponent={
                                <View style={styles.emptyFolderCard}>
                                    <Ionicons name="folder-open-outline" size={38} color="#94a3b8" />
                                    <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#0f172a' }}>
                                        This folder is empty
                                    </Text>
                                    <Text style={{ marginTop: 6, color: '#64748b', textAlign: 'center' }}>
                                        {selectedFolder.type === 'country'
                                            ? 'New photos taken in this country will appear here automatically.'
                                            : selectedCustomFolder?.role === 'viewer'
                                                ? 'You have view-only access. Ask the owner to grant edit access if you should add photos.'
                                                : 'Use Add Memos to place photos inside this library.'}
                                    </Text>
                                </View>
                            }
                            renderItem={({ item, index }) => {
                                const rotation = (index % 2 === 0 ? 1 : -1) * 2;
                                return (
                                    <TouchableOpacity
                                        onPress={() => {
                                            handleClose();
                                            jumpToLocation(item.latitude, item.longitude);
                                        }}
                                        style={{ flex: 1 / 3, padding: 8 }}
                                    >
                                        <View style={[styles.memoGridItem, { transform: [{ rotate: `${rotation}deg` }] }]}>
                                            <ExpoImage
                                                source={{ uri: item.uri }}
                                                style={{ width: '100%', aspectRatio: 1 }}
                                                contentFit="cover"
                                                cachePolicy="memory-disk"
                                            />
                                            {item.title ? (
                                                <Text numberOfLines={1} style={styles.memoGridTitle}>
                                                    {item.title}
                                                </Text>
                                            ) : null}
                                            <Text style={[styles.memoGridDate, { marginTop: item.title ? 2 : 4 }]}>
                                                {item.created_at
                                                    ? new Date(item.created_at).toLocaleDateString()
                                                    : 'Recent'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </Animated.View>
                )}
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
        backgroundColor: '#eef4ff',
    },
    headerInner: {
        minHeight: 68,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    selectedFolderView: {
        flex: 1,
    },
    headerTitleGroup: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 56,
    },
    headerTitle: {
        fontWeight: '800',
        color: '#1e3a8a',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#5b6b85',
        marginTop: 4,
        textAlign: 'center',
    },
    backButton: {
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
    },
    actionsContainer: {
        position: 'absolute',
        right: 0,
        top: 12,
        alignItems: 'flex-end',
    },
    iconButton: {
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
    },
    actionsRow: {
        alignItems: 'flex-end',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderRadius: 999,
        marginTop: 8,
        overflow: 'hidden',
    },
    actionsRowScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    actionChip: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    actionChipText: {
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
    },
    infoCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    createFolderButton: {
        backgroundColor: '#065F46',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerCreateFolderButton: {
        position: 'absolute',
        right: 0,
        top: 12,
    },
    createFolderForm: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: '#dbe4ea',
        borderRadius: 18,
        padding: 16,
        backgroundColor: '#f8fafc',
    },
    folderNameInput: {
        marginTop: 14,
        height: 48,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 14,
        paddingHorizontal: 14,
        backgroundColor: 'white',
        color: '#0f172a',
    },
    primaryButton: {
        backgroundColor: '#065F46',
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
    },
    secondaryButton: {
        backgroundColor: '#e2e8f0',
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
    },
    sendInviteButton: {
        backgroundColor: '#1d4ed8',
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
    },
    showOnMapButton: {
        alignSelf: 'flex-start',
        backgroundColor: '#2563eb',
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    showOnMapButtonText: {
        color: 'white',
        fontWeight: '700',
    },
    countrySubFoldersSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    countrySubFoldersTitle: {
        color: '#0f172a',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 10,
    },
    countrySubFoldersList: {
        paddingRight: 16,
    },
    countrySubFolderSeparator: {
        width: 10,
    },
    countrySubFolderCard: {
        width: 104,
        height: 104,
        backgroundColor: '#1d4ed8',
        borderRadius: 16,
        overflow: 'hidden',
    },
    countrySubFolderCover: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#e2e8f0',
    },
    countrySubFolderFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1d4ed8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    countrySubFolderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.38)',
    },
    countrySubFolderTitleContainer: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: 10,
    },
    countrySubFolderName: {
        color: 'white',
        fontSize: 13,
        fontWeight: '800',
        textShadowColor: 'rgba(15, 23, 42, 0.45)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    emptyCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    emptyFolderCard: {
        marginTop: 60,
        marginHorizontal: 12,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    folderCard: {
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
    customFolderBackground: {
        flex: 1,
        minHeight: 170,
        justifyContent: 'flex-end',
        position: 'relative',
    },
    customFolderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.42)',
    },
    customFolderCoverContent: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 18,
    },
    customFolderCoverTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: 'white',
        textShadowColor: 'rgba(15, 23, 42, 0.45)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    customFolderCoverCount: {
        marginTop: 8,
        color: 'rgba(255, 255, 255, 0.92)',
        fontWeight: '600',
    },
    customFolderCoverLabel: {
        color: 'rgba(255, 255, 255, 0.82)',
        fontSize: 12,
        fontWeight: '600',
    },
    sharedLibraryCoverLabelRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sharedLibraryCoverDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7c3aed',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.85)',
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
        color: '#94a3b8',
        fontSize: 12,
    },
    sharedLibraryLabelRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    sharedLibraryDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#7c3aed',
    },
    panelCard: {
        marginTop: 14,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 14,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    addMemosTabs: {
        flexDirection: 'row',
        marginTop: 14,
        backgroundColor: '#f1f5f9',
        borderRadius: 16,
        padding: 4,
        gap: 4,
    },
    addMemosTab: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 9,
        alignItems: 'center',
    },
    addMemosTabActive: {
        backgroundColor: 'white',
        shadowColor: '#0f172a',
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 1,
    },
    addMemosTabText: {
        color: '#64748b',
        fontSize: 13,
        fontWeight: '700',
    },
    addMemosTabTextActive: {
        color: '#065F46',
    },
    libraryPlaceSearchContainer: {
        marginTop: 12,
    },
    libraryPlaceSearchInputRow: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 16,
        backgroundColor: '#f8fafc',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    libraryPlaceSearchInput: {
        flex: 1,
        color: '#0f172a',
        fontWeight: '600',
        paddingVertical: 10,
    },
    libraryPlaceSearchHint: {
        color: '#64748b',
        marginTop: 12,
        lineHeight: 20,
    },
    libraryPlaceResults: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: 'white',
    },
    libraryPlaceResultItem: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    libraryPlaceResultTitle: {
        color: '#0f172a',
        fontWeight: '700',
    },
    libraryPlaceResultSubtitle: {
        color: '#64748b',
        marginTop: 3,
        fontSize: 12,
    },
    selectedLibraryPlaceCard: {
        marginTop: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#dbeafe',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    selectedLibraryPlaceTitle: {
        color: '#0f172a',
        fontWeight: '800',
        fontSize: 15,
    },
    selectedLibraryPlaceSubtitle: {
        color: '#64748b',
        marginTop: 4,
    },
    addPlaceToLibraryButton: {
        backgroundColor: '#065F46',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    addPlaceToLibraryButtonText: {
        color: 'white',
        fontWeight: '800',
    },
    addRemoveButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
    },
    memoGridItem: {
        backgroundColor: 'white',
        padding: 4,
        paddingBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        elevation: 3,
    },
    memoGridTitle: {
        fontSize: 10,
        color: '#0f172a',
        textAlign: 'center',
        fontWeight: '700',
        marginTop: 6,
        paddingHorizontal: 4,
    },
    memoGridDate: {
        fontSize: 8,
        color: '#c2410c',
        textAlign: 'center',
    },
});
