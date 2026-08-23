import { useAuth } from '@/context/AuthContext';
import { type CustomFolder, type Memory } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { getCountryPhoto } from '@/lib/countryPhotos';
import {
    fetchGooglePlaceDetails,
    fetchGooglePlacePredictions,
    type GooglePlaceDetails,
    type PlacePrediction,
} from '@/lib/googlePlaces';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
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
type LibraryVariant = 'countries' | 'custom';

const PLACEHOLDER_URL = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';
const UNKNOWN_LOCATION = 'Unknown Location';
const LIBRARY_SEGMENTED_CONTROL_WIDTH = 184;
const LIBRARY_SEGMENTED_CONTROL_PADDING = 3;
const LIBRARY_SEGMENT_WIDTH = (LIBRARY_SEGMENTED_CONTROL_WIDTH - LIBRARY_SEGMENTED_CONTROL_PADDING * 2) / 2;
const LIBRARY_TAB_INDICATOR_DURATION_MS = 380;
const LIBRARY_PAGE_FADE_OUT_DURATION_MS = 180;
const LIBRARY_PAGE_FADE_IN_DURATION_MS = 300;

interface Props {
    visible: boolean;
    onClose: () => void;
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    customFolders: CustomFolder[];
    createCustomFolder: (name: string) => Promise<{ success: boolean; message?: string }>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    shareCustomFolder: (recipientInput: string, folderId: string) => Promise<void>;
    grantLibraryEditAccess: (recipientInput: string, folderId: string) => Promise<void>;
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
    variant?: LibraryVariant;
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
    variant = 'custom',
}: Props) {
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [selectedFolder, setSelectedFolder] = useState<LibraryFolder | null>(null);
    const [previousSelectedFolder, setPreviousSelectedFolder] = useState<LibraryFolder | null>(null);
    const [isCreateFolderVisible, setIsCreateFolderVisible] = useState(false);
    const [isAddToFolderVisible, setIsAddToFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isShareLibraryVisible, setIsShareLibraryVisible] = useState(false);
    const [libraryShareRecipient, setLibraryShareRecipient] = useState('');
    const [isGrantAccessVisible, setIsGrantAccessVisible] = useState(false);
    const [grantAccessRecipient, setGrantAccessRecipient] = useState('');
    const [isLibraryActionsVisible, setIsLibraryActionsVisible] = useState(false);
    const [addMemosTab, setAddMemosTab] = useState<AddMemosTab>('saved');
    const [activeVariant, setActiveVariant] = useState<LibraryVariant>(variant);
    const [targetVariant, setTargetVariant] = useState<LibraryVariant>(variant);
    const [libraryPlaceSearchQuery, setLibraryPlaceSearchQuery] = useState('');
    const [libraryPlaceSearchResults, setLibraryPlaceSearchResults] = useState<PlacePrediction[]>([]);
    const [selectedLibraryPlace, setSelectedLibraryPlace] = useState<GooglePlaceDetails | null>(null);
    const [isSearchingLibraryPlaces, setIsSearchingLibraryPlaces] = useState(false);
    const [isAddingLibraryPlace, setIsAddingLibraryPlace] = useState(false);
    const { width: windowWidth } = useWindowDimensions();
    const libraryActionsBarWidth = Math.max(200, windowWidth - 88);
    const folderViewAnimation = useRef(new Animated.Value(1)).current;
    const libraryVariantAnimation = useRef(new Animated.Value(1)).current;
    const librarySegmentAnimation = useRef(new Animated.Value(variant === 'countries' ? 0 : 1)).current;
    const [libraryTransitionDirection, setLibraryTransitionDirection] = useState(1);
    const pendingVariantFadeInRef = useRef(false);
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

    const libraryListAnimatedStyle = useMemo(
        () => ({
            opacity: libraryVariantAnimation,
            transform: [
                {
                    translateX: libraryVariantAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [libraryTransitionDirection * 28, 0],
                    }),
                },
            ],
        }),
        [libraryTransitionDirection, libraryVariantAnimation]
    );

    const librarySegmentIndicatorStyle = useMemo(
        () => ({
            transform: [
                {
                    translateX: librarySegmentAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, LIBRARY_SEGMENT_WIDTH],
                    }),
                },
            ],
        }),
        [librarySegmentAnimation]
    );

    useEffect(() => {
        if (visible) {
            setActiveVariant(variant);
            setTargetVariant(variant);
            libraryVariantAnimation.setValue(1);
            librarySegmentAnimation.setValue(variant === 'countries' ? 0 : 1);
            return;
        }

        if (!visible) {
            setSelectedFolder(null);
            setPreviousSelectedFolder(null);
            setIsCreateFolderVisible(false);
            setIsAddToFolderVisible(false);
            setIsLibraryActionsVisible(false);
            setNewFolderName('');
            setIsShareLibraryVisible(false);
            setLibraryShareRecipient('');
            setIsGrantAccessVisible(false);
            setGrantAccessRecipient('');
            setAddMemosTab('saved');
            setLibraryPlaceSearchQuery('');
            setLibraryPlaceSearchResults([]);
            setSelectedLibraryPlace(null);
            setIsSearchingLibraryPlaces(false);
            setIsAddingLibraryPlace(false);
            setActiveVariant(variant);
            setTargetVariant(variant);
        }
    }, [librarySegmentAnimation, libraryVariantAnimation, variant, visible]);

    // Start the fade-in only after React has committed the new variant's content to the view
    // tree, preventing the old list from briefly appearing at non-zero opacity during the
    // animation (race between native animation thread and JS render commit).
    useEffect(() => {
        if (!pendingVariantFadeInRef.current) return;
        pendingVariantFadeInRef.current = false;
        Animated.timing(libraryVariantAnimation, {
            toValue: 1,
            duration: LIBRARY_PAGE_FADE_IN_DURATION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [activeVariant, libraryVariantAnimation]);

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

        sortedVisibleMemories.forEach(memory => {
            if (memory.excludeFromCountryFolder) return;
            const countryName = memory.country || 'Unknown Location';
            folderCounts.set(countryName, (folderCounts.get(countryName) || 0) + 1);
        });

        const folders = Array.from(folderCounts.entries())
            .filter(([, count]) => count > 0)
            .map(([name, memoCount]) => ({
                id: `country-${name.toLowerCase()}`,
                name,
                type: 'country' as const,
                memoCount,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return folders;
    }, [sortedVisibleMemories]);

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

    const libraryFolders = useMemo((): LibraryFolder[] => {
        return activeVariant === 'countries' ? countryFolders : customLibraryFolders;
    }, [activeVariant, countryFolders, customLibraryFolders]);

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

    const handleVariantChange = useCallback((nextVariant: LibraryVariant) => {
        if (nextVariant === activeVariant) return;

        Keyboard.dismiss();
        setTargetVariant(nextVariant);
        setLibraryTransitionDirection(nextVariant === 'custom' ? 1 : -1);

        Animated.parallel([
            Animated.timing(librarySegmentAnimation, {
                toValue: nextVariant === 'countries' ? 0 : 1,
                duration: LIBRARY_TAB_INDICATOR_DURATION_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(libraryVariantAnimation, {
                toValue: 0,
                duration: LIBRARY_PAGE_FADE_OUT_DURATION_MS,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => {
            libraryVariantAnimation.setValue(0);
            setActiveVariant(nextVariant);
            setSelectedFolder(null);
            setPreviousSelectedFolder(null);
            setIsCreateFolderVisible(false);
            setIsAddToFolderVisible(false);
            setIsLibraryActionsVisible(false);
            setIsShareLibraryVisible(false);
            setLibraryShareRecipient('');
            setIsGrantAccessVisible(false);
            setGrantAccessRecipient('');
            setAddMemosTab('saved');
            clearLibraryPlaceSearch();
            // Signal the effect to start the fade-in only after React commits the new content.
            pendingVariantFadeInRef.current = true;
        });
    }, [
        activeVariant,
        clearLibraryPlaceSearch,
        librarySegmentAnimation,
        libraryVariantAnimation,
    ]);

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
        if (!user?.id) {
            alertRequireSignIn('Sign in to create custom libraries and organize memos.');
            return;
        }
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
                        setLibraryShareRecipient('');
                        setIsGrantAccessVisible(false);
                        setGrantAccessRecipient('');
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
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundSoft }}>
                {/* Header */}
                <View style={styles.headerContainer}>
                    <View style={styles.headerInner}>
                        {selectedFolder ? (
                            <TouchableOpacity
                                onPress={() => {
                                    setIsAddToFolderVisible(false);
                                    setIsLibraryActionsVisible(false);
                                    setIsShareLibraryVisible(false);
                                    setLibraryShareRecipient('');
                                    setIsGrantAccessVisible(false);
                                    setGrantAccessRecipient('');
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
                                <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleClose} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                            </TouchableOpacity>
                        )}

                        {selectedFolder ? (
                            <View style={styles.actionsContainer}>
                                <View style={styles.headerIconRow}>
                                    {canAddMemosToFolder ? (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsShareLibraryVisible(false);
                                                setLibraryShareRecipient('');
                                                setIsGrantAccessVisible(false);
                                                setGrantAccessRecipient('');
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
                                                styles.folderActionButton,
                                                { backgroundColor: isAddToFolderVisible ? '#0284c7' : '#0ea5e9' },
                                            ]}
                                        >
                                            <Ionicons name={isAddToFolderVisible ? 'close' : 'add'} size={20} color="white" />
                                        </TouchableOpacity>
                                    ) : null}
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (selectedFolderMemories.length === 0) {
                                                Alert.alert('No memos yet', 'This folder has no memos to show on the map.');
                                                return;
                                            }
                                            onShowFolderOnMap(selectedFolder.id, selectedFolder.type, selectedFolder.name);
                                        }}
                                        style={styles.folderActionButton}
                                    >
                                        <Ionicons name="map-outline" size={20} color="white" />
                                    </TouchableOpacity>
                                    {selectedFolder.type === 'custom' ? (
                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsLibraryActionsVisible(previous => {
                                                    const next = !previous;
                                                    if (!next) {
                                                        setIsAddToFolderVisible(false);
                                                        setIsShareLibraryVisible(false);
                                                        setLibraryShareRecipient('');
                                                        setIsGrantAccessVisible(false);
                                                        setGrantAccessRecipient('');
                                                    }
                                                    return next;
                                                });
                                            }}
                                            style={styles.iconButton}
                                        >
                                            <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                                {selectedFolder.type === 'custom' && isLibraryActionsVisible ? (
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
                                                onPress={() => { void handleUpdateSelectedLibraryCover(); }}
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
                                                    setGrantAccessRecipient('');
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
                                                    setLibraryShareRecipient('');
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
                            <View style={styles.librarySegmentedControl}>
                                <Animated.View
                                    pointerEvents="none"
                                    style={[
                                        styles.librarySegmentIndicator,
                                        librarySegmentIndicatorStyle,
                                    ]}
                                />
                                <TouchableOpacity
                                    onPress={() => handleVariantChange('countries')}
                                    style={[
                                        styles.librarySegment,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.librarySegmentText,
                                            activeVariant === 'countries' ? styles.librarySegmentTextActive : null,
                                        ]}
                                    >
                                        Countries
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleVariantChange('custom')}
                                    style={[
                                        styles.librarySegment,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.librarySegmentText,
                                            activeVariant === 'custom' ? styles.librarySegmentTextActive : null,
                                        ]}
                                    >
                                        Private
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {targetVariant === 'custom' && !selectedFolder ? (
                            <TouchableOpacity
                                onPress={() => {
                                    if (!user?.id) {
                                        alertRequireSignIn('Sign in to create custom libraries and organize memos.');
                                        return;
                                    }
                                    setIsCreateFolderVisible((prev) => !prev);
                                }}
                                style={[styles.createFolderButton, styles.headerCreateFolderButton]}
                            >
                                <Ionicons
                                    name={isCreateFolderVisible ? 'close' : 'add'}
                                    size={22}
                                    color="white"
                                />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Body */}
                {!selectedFolder ? (
                    <Animated.View style={[styles.libraryListContainer, libraryListAnimatedStyle]}>
                        <FlatList
                            data={libraryFolders}
                            numColumns={2}
                            key={`folder-grid-${activeVariant}`}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
                            ListHeaderComponent={
                                activeVariant === 'custom' && isCreateFolderVisible ? (
                                    <View style={styles.infoCard}>
                                        <View style={styles.createFolderForm}>
                                            <Text style={[styles.panelInlineTitle]}>
                                                New Custom Folder
                                            </Text>
                                            <Text style={styles.panelInlineText}>
                                                Create folders like Food, Museums, or Friends and then add memos to them.
                                            </Text>
                                            <TextInput
                                                style={styles.folderNameInput}
                                                placeholder="Folder name"
                                                placeholderTextColor={theme.colors.placeholder}
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
                                                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                ) : null
                            }
                            ListEmptyComponent={
                                activeVariant === 'countries' ? (
                                    <View style={styles.emptyCard}>
                                        <Ionicons name="images-outline" size={36} color={theme.colors.textMuted} />
                                        <Text style={styles.emptyInlineTitle}>
                                            No country folders yet
                                        </Text>
                                        <Text style={styles.emptyInlineText}>
                                            Save memos from different countries and they will appear here automatically.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.emptyCard}>
                                        <Ionicons name="folder-open-outline" size={36} color={theme.colors.textMuted} />
                                        <Text style={styles.emptyInlineTitle}>
                                            No custom libraries yet
                                        </Text>
                                        <Text style={styles.emptyInlineText}>
                                            Tap Create Folder above to add your first library.
                                        </Text>
                                    </View>
                                )
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsAddToFolderVisible(false);
                                        setIsLibraryActionsVisible(false);
                                        setIsShareLibraryVisible(false);
                                        setLibraryShareRecipient('');
                                        setIsGrantAccessVisible(false);
                                        setGrantAccessRecipient('');
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
                                                    <Ionicons name="folder-open" size={24} color={theme.colors.accentText} />
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
                    </Animated.View>
                ) : (
                    <Animated.View style={[styles.selectedFolderView, folderViewAnimatedStyle]}>
                        {selectedFolder.type === 'custom' ? (
                            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                {isShareLibraryVisible && canShareSelectedFolder ? (
                                    <View style={styles.panelCard}>
                                        <Text style={styles.panelInlineTitle}>
                                            Share {selectedFolder.name}
                                        </Text>
                                        <TextInput
                                            value={libraryShareRecipient}
                                            onChangeText={setLibraryShareRecipient}
                                            placeholder="Friend's username"
                                            placeholderTextColor={theme.colors.placeholder}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="default"
                                            style={styles.folderNameInput}
                                            returnKeyType="send"
                                        />
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                            <TouchableOpacity
                                                onPress={async () => {
                                                    await shareCustomFolder(libraryShareRecipient.trim(), selectedFolder.id);
                                                    setIsShareLibraryVisible(false);
                                                    setLibraryShareRecipient('');
                                                }}
                                                style={styles.sendInviteButton}
                                            >
                                                <Text style={{ color: 'white', fontWeight: '700' }}>Send Invite</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsShareLibraryVisible(false);
                                                    setLibraryShareRecipient('');
                                                }}
                                                style={styles.secondaryButton}
                                            >
                                                <Text style={styles.secondaryButtonText}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : null}

                                {isGrantAccessVisible && canGrantEditAccess ? (
                                    <View style={styles.panelCard}>
                                        <Text style={styles.panelInlineTitle}>
                                            Grant edit access for {selectedFolder.name}
                                        </Text>
                                        <TextInput
                                            value={grantAccessRecipient}
                                            onChangeText={setGrantAccessRecipient}
                                            placeholder="Their username"
                                            placeholderTextColor={theme.colors.placeholder}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="default"
                                            style={styles.folderNameInput}
                                            returnKeyType="send"
                                        />
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                                            <TouchableOpacity
                                                onPress={async () => {
                                                    await grantLibraryEditAccess(grantAccessRecipient.trim(), selectedFolder.id);
                                                    setIsGrantAccessVisible(false);
                                                    setGrantAccessRecipient('');
                                                }}
                                                style={styles.sendInviteButton}
                                            >
                                                <Text style={{ color: 'white', fontWeight: '700' }}>Grant access</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setIsGrantAccessVisible(false);
                                                    setGrantAccessRecipient('');
                                                }}
                                                style={styles.secondaryButton}
                                            >
                                                <Text style={styles.secondaryButtonText}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : null}

                                {isAddToFolderVisible ? (
                                    <View style={styles.panelCard}>
                                        <Text style={styles.panelInlineTitle}>
                                            Add photos to {selectedFolder.name}
                                        </Text>
                                        <Text style={styles.panelInlineText}>
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
                                                        <Ionicons name="camera-outline" size={32} color={theme.colors.textMuted} />
                                                        <Text style={styles.emptyInlineText}>
                                                            Take a photo first, then you can place it in this library.
                                                        </Text>
                                                    </View>
                                                }
                                                ItemSeparatorComponent={() => (
                                                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 10 }} />
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
                                                                style={{ width: 62, height: 62, borderRadius: 16, backgroundColor: theme.colors.surfaceMuted }}
                                                                contentFit="cover"
                                                                cachePolicy="memory-disk"
                                                            />
                                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                                <Text style={styles.savedMemoTitle} numberOfLines={1}>
                                                                    {displayTitle}
                                                                </Text>
                                                                {item.description ? (
                                                                    <Text style={styles.savedMemoDescription} numberOfLines={1}>
                                                                        {item.description}
                                                                    </Text>
                                                                ) : null}
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
                                                    <Ionicons name="search" size={18} color={theme.colors.textMuted} />
                                                    <TextInput
                                                        value={libraryPlaceSearchQuery}
                                                        onChangeText={fetchLibraryPlaces}
                                                        placeholder="Search Google Maps"
                                                        placeholderTextColor={theme.colors.placeholder}
                                                        returnKeyType="search"
                                                        style={styles.libraryPlaceSearchInput}
                                                    />
                                                    {libraryPlaceSearchQuery.length > 0 ? (
                                                        <TouchableOpacity onPress={clearLibraryPlaceSearch}>
                                                            <Ionicons name="close-circle" size={20} color={theme.colors.borderStrong} />
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
                                                setLibraryShareRecipient('');
                                                setIsGrantAccessVisible(false);
                                                setGrantAccessRecipient('');
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
                                    <Ionicons name="folder-open-outline" size={38} color={theme.colors.textMuted} />
                                    <Text style={styles.emptyInlineTitle}>
                                        This folder is empty
                                    </Text>
                                    <Text style={styles.emptyInlineText}>
                                        {selectedFolder.type === 'country'
                                            ? 'New photos taken in this country will appear here automatically.'
                                            : selectedCustomFolder?.role === 'viewer'
                                                ? 'You have view-only access. Ask the owner to grant edit access if you should add photos.'
                                                : 'Use Add Memos to place photos inside this library.'}
                                    </Text>
                                </View>
                            }
                            renderItem={({ item, index }) => {
                                const POLAROID_ROTATIONS = [-2.5, 1.8, -1.3, 2.6, -1.8, 2.2, -2.8, 1.4];
                                const rotation = POLAROID_ROTATIONS[index % POLAROID_ROTATIONS.length];
                                return (
                                    <TouchableOpacity
                                        onPress={() => {
                                            handleClose();
                                            jumpToLocation(item.latitude, item.longitude);
                                        }}
                                        style={{ flex: 1 / 3, padding: 10 }}
                                    >
                                        {/* Ambient (soft) shadow layer */}
                                        <View style={[styles.memoGridAmbientShadow, { transform: [{ rotate: `${rotation}deg` }] }]}>
                                            {/* Directional (crisp) shadow layer + polaroid body */}
                                            <View style={styles.memoGridItem}>
                                                <View style={styles.memoGridImageFrame}>
                                                    <ExpoImage
                                                        source={{ uri: item.uri }}
                                                        style={{ width: '100%', aspectRatio: 1 }}
                                                        contentFit="cover"
                                                        cachePolicy="memory-disk"
                                                    />
                                                </View>
                                                {item.title ? (
                                                    <Text numberOfLines={1} style={styles.memoGridTitle}>
                                                        {item.title}
                                                    </Text>
                                                ) : null}
                                            </View>
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

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    headerContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
        backgroundColor: colors.backgroundSoft,
    },
    headerInner: {
        minHeight: 82,
        justifyContent: 'flex-end',
        alignItems: 'center',
        position: 'relative',
    },
    selectedFolderView: {
        flex: 1,
    },
    libraryListContainer: {
        flex: 1,
    },
    headerTitleGroup: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 56,
    },
    headerTitle: {
        fontWeight: '800',
        color: colors.accentText,
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 4,
        textAlign: 'center',
    },
    librarySegmentedControl: {
        flexDirection: 'row',
        width: LIBRARY_SEGMENTED_CONTROL_WIDTH,
        padding: LIBRARY_SEGMENTED_CONTROL_PADDING,
        borderRadius: 999,
        backgroundColor: colors.surfaceMuted,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    librarySegmentIndicator: {
        position: 'absolute',
        left: LIBRARY_SEGMENTED_CONTROL_PADDING,
        top: LIBRARY_SEGMENTED_CONTROL_PADDING,
        width: LIBRARY_SEGMENT_WIDTH,
        height: 28,
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        shadowColor: colors.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 1,
    },
    librarySegment: {
        flex: 1,
        minHeight: 28,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    librarySegmentText: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textMuted,
    },
    librarySegmentTextActive: {
        color: colors.accentText,
    },
    backButton: {
        position: 'absolute',
        left: 0,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
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
        backgroundColor: colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
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
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    createFolderButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#0ea5e9',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0f172a',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    headerCreateFolderButton: {
        position: 'absolute',
        right: 0,
        top: 10,
    },
    createFolderForm: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 18,
        padding: 16,
        backgroundColor: colors.surfaceMuted,
    },
    folderNameInput: {
        marginTop: 14,
        height: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        backgroundColor: colors.input,
        color: colors.text,
    },
    primaryButton: {
        backgroundColor: '#0ea5e9',
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
    },
    secondaryButton: {
        backgroundColor: colors.surfaceMuted,
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
    headerIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    folderActionButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#2563eb',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0f172a',
        shadowOpacity: 0.14,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    countrySubFoldersSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    countrySubFoldersTitle: {
        color: colors.text,
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
        backgroundColor: colors.surfaceMuted,
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
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    emptyFolderCard: {
        marginTop: 60,
        marginHorizontal: 12,
        backgroundColor: colors.surface,
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
        backgroundColor: colors.surface,
        shadowColor: colors.shadow,
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
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    customFolderTitle: {
        marginTop: 16,
        fontSize: 17,
        fontWeight: '700',
        color: colors.text,
    },
    customFolderCount: {
        marginTop: 6,
        color: colors.textMuted,
    },
    customFolderLabel: {
        color: colors.textMuted,
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
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 14,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    addMemosTabs: {
        flexDirection: 'row',
        marginTop: 14,
        backgroundColor: colors.surfaceMuted,
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
        backgroundColor: colors.surfaceElevated,
        shadowColor: colors.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 1,
    },
    addMemosTabText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    addMemosTabTextActive: {
        color: '#0369a1',
    },
    libraryPlaceSearchContainer: {
        marginTop: 12,
    },
    libraryPlaceSearchInputRow: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        backgroundColor: colors.input,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    libraryPlaceSearchInput: {
        flex: 1,
        color: colors.text,
        fontWeight: '600',
        paddingVertical: 10,
    },
    libraryPlaceSearchHint: {
        color: colors.textMuted,
        marginTop: 12,
        lineHeight: 20,
    },
    libraryPlaceResults: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    libraryPlaceResultItem: {
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    libraryPlaceResultTitle: {
        color: colors.text,
        fontWeight: '700',
    },
    libraryPlaceResultSubtitle: {
        color: colors.textMuted,
        marginTop: 3,
        fontSize: 12,
    },
    selectedLibraryPlaceCard: {
        marginTop: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.surfaceMuted,
        borderWidth: 1,
        borderColor: '#dbeafe',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    selectedLibraryPlaceTitle: {
        color: colors.text,
        fontWeight: '800',
        fontSize: 15,
    },
    selectedLibraryPlaceSubtitle: {
        color: colors.textMuted,
        marginTop: 4,
    },
    addPlaceToLibraryButton: {
        backgroundColor: '#0ea5e9',
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
    memoGridAmbientShadow: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        borderRadius: 7,
    },
    memoGridItem: {
        backgroundColor: '#fffef9',
        padding: 5,
        paddingBottom: 10,
        shadowColor: '#0f172a',
        shadowOpacity: 0.3,
        shadowRadius: 5,
        shadowOffset: { width: 2, height: 5 },
        elevation: 8,
        borderRadius: 7,
        borderWidth: 0.5,
        borderColor: 'rgba(0, 0, 0, 0.08)',
    },
    memoGridImageFrame: {
        overflow: 'hidden',
        borderRadius: 4,
    },
    memoGridTitle: {
        fontSize: 11,
        color: '#374151',
        textAlign: 'center',
        fontWeight: '600',
        fontStyle: 'italic',
        marginTop: 8,
        paddingHorizontal: 3,
        letterSpacing: 0.1,
    },
    panelInlineTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    panelInlineText: {
        color: colors.textMuted,
        marginTop: 4,
        lineHeight: 20,
    },
    secondaryButtonText: {
        color: colors.textSecondary,
        fontWeight: '700',
    },
    emptyInlineTitle: {
        marginTop: 12,
        fontSize: 16,
        fontWeight: '600',
        color: colors.text,
        textAlign: 'center',
    },
    emptyInlineText: {
        marginTop: 6,
        color: colors.textMuted,
        textAlign: 'center',
    },
    savedMemoTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    savedMemoDescription: {
        fontSize: 13,
        color: colors.textSecondary,
        marginTop: 2,
    },
});
