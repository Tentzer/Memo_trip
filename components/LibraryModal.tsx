import { type CustomFolder, type Memory } from '@/context/MemoryContext';
import { getCountryPhoto } from '@/lib/countryPhotos';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type LibraryFolder = {
    id: string;
    name: string;
    type: 'country' | 'custom';
    memoCount: number;
    owner_id?: string;
    role?: 'owner' | 'viewer';
    isShared?: boolean;
};

interface Props {
    visible: boolean;
    onClose: () => void;
    memories: Memory[];
    customFolders: CustomFolder[];
    createCustomFolder: (name: string) => Promise<{ success: boolean; message?: string }>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    shareCustomFolder: (email: string, folderId: string) => Promise<void>;
    toggleMemoryInCustomFolder: (memoryId: string, folderId: string) => Promise<void>;
    getLibraryMemories: (folderId: string) => Memory[];
    jumpToLocation: (lat: number, lng: number) => void;
    onShowFolderOnMap: (folderId: string, folderType: 'country' | 'custom', folderName: string) => void;
}

export default function LibraryModal({
    visible,
    onClose,
    memories,
    customFolders,
    createCustomFolder,
    removeLibrary,
    shareCustomFolder,
    toggleMemoryInCustomFolder,
    getLibraryMemories,
    jumpToLocation,
    onShowFolderOnMap,
}: Props) {
    const [selectedFolder, setSelectedFolder] = useState<LibraryFolder | null>(null);
    const [isCreateFolderVisible, setIsCreateFolderVisible] = useState(false);
    const [isAddToFolderVisible, setIsAddToFolderVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isShareLibraryVisible, setIsShareLibraryVisible] = useState(false);
    const [libraryShareEmail, setLibraryShareEmail] = useState('');
    const [isLibraryActionsVisible, setIsLibraryActionsVisible] = useState(false);

    useEffect(() => {
        if (!visible) {
            setSelectedFolder(null);
            setIsCreateFolderVisible(false);
            setIsAddToFolderVisible(false);
            setIsLibraryActionsVisible(false);
            setNewFolderName('');
            setIsShareLibraryVisible(false);
            setLibraryShareEmail('');
        }
    }, [visible]);

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
            if (memory.excludeFromCountryFolder) return;
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
        if (!selectedFolder) return [];

        if (selectedFolder.type === 'country') {
            return sortedMemories.filter(
                memory =>
                    !memory.excludeFromCountryFolder &&
                    (memory.country || 'Unknown Location') === selectedFolder.name
            );
        }

        return getLibraryMemories(selectedFolder.id);
    }, [getLibraryMemories, selectedFolder, sortedMemories]);

    const canManageSelectedFolder = selectedFolder?.type === 'custom' && selectedFolder.role === 'owner';
    const canShareSelectedFolder = selectedFolder?.type === 'custom' && selectedFolder.role === 'owner';

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
                        setSelectedFolder(null);
                    },
                },
            ]
        );
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
                                    setSelectedFolder(null);
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
                                            }
                                            return next;
                                        });
                                    }}
                                    style={styles.iconButton}
                                >
                                    <Ionicons name="settings-outline" size={20} color="#334155" />
                                </TouchableOpacity>
                                {isLibraryActionsVisible ? (
                                    <View style={styles.actionsRow}>
                                        {canManageSelectedFolder ? (
                                            <TouchableOpacity
                                                onPress={() => setIsAddToFolderVisible(prev => !prev)}
                                                style={[styles.actionChip, { backgroundColor: isAddToFolderVisible ? '#047857' : '#065F46' }]}
                                            >
                                                <Ionicons name="add" size={15} color="white" />
                                                <Text style={styles.actionChipText}>Add</Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {canShareSelectedFolder ? (
                                            <TouchableOpacity
                                                onPress={() => setIsShareLibraryVisible(prev => !prev)}
                                                style={[styles.actionChip, { backgroundColor: isShareLibraryVisible ? '#1e40af' : '#1d4ed8' }]}
                                            >
                                                <Ionicons name="share-social-outline" size={15} color="white" />
                                                <Text style={styles.actionChipText}>Share</Text>
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
                                    setSelectedFolder(item);
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
                                        <Text style={styles.customFolderLabel}>
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

                                {isAddToFolderVisible ? (
                                    <View style={styles.panelCard}>
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
                                                                {item.country || 'Unknown Location'}
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
                                    </View>
                                ) : null}
                            </View>
                        ) : null}

                        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
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
                    </View>
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
        flexDirection: 'row',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 6,
        marginTop: 8,
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
