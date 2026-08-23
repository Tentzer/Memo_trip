import { useMarketplace } from '@/hooks/useMarketplace';
import { useAppTheme } from '@/context/ThemeContext';
import { MarketLibrary, MarketPhoto } from '@/lib/marketplaceApi';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { CustomFolder, Memory } from '@/types/memory';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Props {
    visible: boolean;
    onClose: () => void;
    userId?: string;
    customFolders: CustomFolder[];
    memories: Memory[];
    reloadMemories: () => Promise<void>;
}

type ScreenMode = 'list' | 'publish';

export default function MarketPlaceModal({
    visible,
    onClose,
    userId,
    customFolders,
    memories,
    reloadMemories,
}: Props) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [screenMode, setScreenMode] = useState<ScreenMode>('list');
    const [selectedPublishLibraryId, setSelectedPublishLibraryId] = useState<string | null>(null);
    const [publishDescription, setPublishDescription] = useState('');
    const [countryInput, setCountryInput] = useState('');

    const {
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
    } = useMarketplace({ userId, customFolders, memories, reloadMemories });

    useEffect(() => {
        if (!visible) {
            setScreenMode('list');
            setSelectedPublishLibraryId(null);
            setPublishDescription('');
            setCountryInput('');
            closeMarketLibrary();
            return;
        }

        void loadMarketLibraries();
    }, [closeMarketLibrary, loadMarketLibraries, visible]);

    useEffect(() => {
        if (!selectedPublishLibraryId && ownedCustomFolders.length > 0) {
            setSelectedPublishLibraryId(ownedCustomFolders[0].id);
        }
    }, [ownedCustomFolders, selectedPublishLibraryId]);

    const selectedPublishLibrary = useMemo(
        () => ownedCustomFolders.find(folder => folder.id === selectedPublishLibraryId) ?? null,
        [ownedCustomFolders, selectedPublishLibraryId]
    );

    const selectedPublishMemories = useMemo(
        () => selectedPublishLibrary ? getLibraryMemories(selectedPublishLibrary.id) : [],
        [getLibraryMemories, selectedPublishLibrary]
    );

    const untitledPublishMemoCount = useMemo(
        () => selectedPublishMemories.filter(memory => !memory.title?.trim()).length,
        [selectedPublishMemories]
    );

    const handleBack = useCallback(() => {
        if (selectedDetails) {
            closeMarketLibrary();
            return;
        }

        if (screenMode === 'publish') {
            setScreenMode('list');
            setPublishDescription('');
            return;
        }

        onClose();
    }, [closeMarketLibrary, onClose, screenMode, selectedDetails]);

    const handleOpenLibrary = useCallback(async (libraryId: string) => {
        const result = await openMarketLibrary(libraryId);
        if (result.error) {
            Alert.alert('Could not open library', result.error);
        }
    }, [openMarketLibrary]);

    const handleDownload = useCallback(async (libraryId: string) => {
        if (!userId) {
            alertRequireSignIn('Sign in to download this library to your memos.');
            return;
        }
        const result = await downloadLibrary(libraryId);
        if (result.error) {
            Alert.alert('Download failed', result.error);
            return;
        }

        Alert.alert('Library downloaded', 'The marketplace library was copied to My Memos.');
    }, [downloadLibrary, userId]);

    const handlePublish = useCallback(async () => {
        if (!selectedPublishLibrary) {
            Alert.alert('Choose a library', 'Select one of your custom libraries first.');
            return;
        }

        const result = await publishLibrary(selectedPublishLibrary.id, publishDescription);
        if (result.error) {
            Alert.alert('Publish failed', result.error);
            return;
        }

        setScreenMode('list');
        setSelectedPublishLibraryId(null);
        setPublishDescription('');
        Alert.alert('Published', `${selectedPublishLibrary.name} is now in the marketplace.`);
    }, [publishDescription, publishLibrary, selectedPublishLibrary]);

    const handleApplyCountryFilter = useCallback(async () => {
        const result = await applyCountryFilter(countryInput);
        if (result.error) {
            Alert.alert('Filter failed', result.error);
        }
    }, [applyCountryFilter, countryInput]);

    const handleClearCountryFilter = useCallback(async () => {
        setCountryInput('');
        const result = await applyCountryFilter();
        if (result.error) {
            Alert.alert('Filter failed', result.error);
        }
    }, [applyCountryFilter]);

    const renderMarketLibrary = ({ item }: { item: MarketLibrary }) => {
        const isDownloaded = downloadedMarketLibraryIds.includes(item.id);

        return (
            <TouchableOpacity
                onPress={() => { void handleOpenLibrary(item.id); }}
                style={styles.card}
            >
                {item.coverImageUrl ? (
                    <ExpoImage source={{ uri: item.coverImageUrl }} style={styles.coverImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                    <View style={[styles.coverImage, styles.coverFallback]}>
                        <Ionicons name="storefront-outline" size={30} color={theme.colors.textMuted} />
                    </View>
                )}
                <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                        {isDownloaded ? (
                            <View style={styles.downloadedBadge}>
                                <Ionicons name="checkmark-circle" size={14} color="#166534" />
                                <Text style={styles.downloadedBadgeText}>Downloaded</Text>
                            </View>
                        ) : null}
                    </View>
                    {item.description ? (
                        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <View style={styles.metaRow}>
                        <Text style={styles.metaText}>{item.photoCount} memo{item.photoCount === 1 ? '' : 's'}</Text>
                        <Text style={styles.metaText}>{item.downloadCount} downloads</Text>
                    </View>
                    {item.country ? <Text style={styles.countryText}>{item.country}</Text> : null}
                </View>
            </TouchableOpacity>
        );
    };

    const renderPublishLibrary = ({ item }: { item: CustomFolder }) => {
        const libraryMemories = getLibraryMemories(item.id);
        const untitledCount = libraryMemories.filter(memory => !memory.title?.trim()).length;
        const isSelected = item.id === selectedPublishLibraryId;

        return (
            <TouchableOpacity
                onPress={() => setSelectedPublishLibraryId(item.id)}
                style={[styles.publishLibraryCard, isSelected && styles.publishLibraryCardSelected]}
            >
                <View style={styles.publishLibraryIcon}>
                    <Ionicons name={isSelected ? 'radio-button-on' : 'radio-button-off'} size={22} color={theme.colors.accent} />
                </View>
                <View style={styles.publishLibraryText}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={styles.cardDescription}>
                        {libraryMemories.length} memo{libraryMemories.length === 1 ? '' : 's'}
                    </Text>
                    {untitledCount > 0 ? (
                        <Text style={styles.warningText}>
                            {untitledCount} memo{untitledCount === 1 ? '' : 's'} need titles before publishing.
                        </Text>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    };

    const renderDetailPhoto = ({ item }: { item: MarketPhoto }) => (
        <View style={styles.photoCard}>
            <ExpoImage source={{ uri: item.imageUrl }} style={styles.photoImage} contentFit="cover" cachePolicy="memory-disk" />
            <Text style={styles.photoTitle} numberOfLines={1}>{item.title || 'Untitled memo'}</Text>
        </View>
    );

    const headerTitle = selectedDetails ? selectedDetails.library.name : screenMode === 'publish' ? 'Publish Library' : 'Marketplace';
    const headerSubtitle = selectedDetails
        ? `${selectedDetails.photos.length} memo${selectedDetails.photos.length === 1 ? '' : 's'}`
        : screenMode === 'publish'
            ? 'Choose one of your libraries'
            : countryFilter
                ? `Browsing ${countryFilter}`
                : 'Discover libraries from other travelers';
    const selectedLibraryAlreadyDownloaded = selectedDetails
        ? downloadedMarketLibraryIds.includes(selectedDetails.library.id)
        : false;
    const selectedLibraryIsDownloading = selectedDetails
        ? downloadingLibraryId === selectedDetails.library.id
        : false;

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleBack}>
            <SafeAreaView style={styles.screen}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                    </TouchableOpacity>
                    <View style={styles.headerText}>
                        <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>
                        <Text style={styles.subtitle} numberOfLines={1}>{headerSubtitle}</Text>
                    </View>
                    {!selectedDetails && screenMode === 'list' ? (
                        <TouchableOpacity onPress={() => setScreenMode('publish')} style={styles.headerAction}>
                            <Ionicons name="cloud-upload-outline" size={16} color="white" />
                            <Text style={styles.headerActionText}>Post</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {screenMode === 'publish' ? (
                    <ScrollView contentContainerStyle={styles.publishContent} keyboardShouldPersistTaps="handled">
                        <View style={styles.panel}>
                            <Text style={styles.panelTitle}>Marketplace snapshot</Text>
                            <Text style={styles.panelText}>
                                Publishing copies the library metadata into the marketplace. The JPG URLs are reused, and future edits to your private library will not update this post.
                            </Text>
                            <TextInput
                                value={publishDescription}
                                onChangeText={setPublishDescription}
                                placeholder="Optional description"
                                placeholderTextColor={theme.colors.placeholder}
                                multiline
                                style={styles.descriptionInput}
                            />
                        </View>

                        {ownedCustomFolders.length > 0 ? (
                            ownedCustomFolders.map(folder => (
                                <View key={folder.id}>
                                    {renderPublishLibrary({ item: folder })}
                                </View>
                            ))
                        ) : (
                                <View style={styles.emptyState}>
                                    <Ionicons name="folder-open-outline" size={40} color={theme.colors.textMuted} />
                                    <Text style={styles.emptyTitle}>No owned custom libraries</Text>
                                    <Text style={styles.emptyText}>Create a custom library in My Memos before publishing to the marketplace.</Text>
                                </View>
                        )}

                        {selectedPublishLibrary ? (
                            <View style={styles.publishSummary}>
                                <Text style={styles.summaryText}>
                                    {selectedPublishMemories.length} memo{selectedPublishMemories.length === 1 ? '' : 's'} selected
                                </Text>
                                {untitledPublishMemoCount > 0 ? (
                                    <Text style={styles.warningText}>All memos need titles before this can be published.</Text>
                                ) : null}
                                <TouchableOpacity
                                    onPress={() => { void handlePublish(); }}
                                    disabled={publishingLibraryId !== null || selectedPublishMemories.length === 0 || untitledPublishMemoCount > 0}
                                    style={[
                                        styles.primaryButton,
                                        (publishingLibraryId !== null || selectedPublishMemories.length === 0 || untitledPublishMemoCount > 0) && styles.disabledButton,
                                    ]}
                                >
                                    {publishingLibraryId ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Text style={styles.primaryButtonText}>Publish to Marketplace</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : null}
                    </ScrollView>
                ) : selectedDetails ? (
                    <View style={styles.detailContent}>
                        {isLoadingDetails ? (
                            <View style={styles.loadingState}>
                                    <ActivityIndicator size="large" color={theme.colors.accent} />
                                <Text style={styles.loadingText}>Loading library...</Text>
                            </View>
                        ) : (
                            <>
                                <View style={styles.detailHero}>
                                    {selectedDetails.library.coverImageUrl ? (
                                        <ExpoImage
                                            source={{ uri: selectedDetails.library.coverImageUrl }}
                                            style={styles.detailHeroImage}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                        />
                                    ) : (
                                        <View style={[styles.detailHeroImage, styles.coverFallback]}>
                                            <Ionicons name="storefront-outline" size={34} color={theme.colors.textMuted} />
                                        </View>
                                    )}
                                    <View style={styles.detailHeroText}>
                                        <Text style={styles.detailTitle}>{selectedDetails.library.name}</Text>
                                        {selectedDetails.library.description ? (
                                            <Text style={styles.detailDescription}>{selectedDetails.library.description}</Text>
                                        ) : null}
                                        <Text style={styles.metaText}>
                                            {selectedDetails.library.photoCount} memos · {selectedDetails.library.downloadCount} downloads
                                        </Text>
                                    </View>
                                </View>

                                <FlatList
                                    data={selectedDetails.photos}
                                    keyExtractor={(item) => item.id}
                                    renderItem={renderDetailPhoto}
                                    numColumns={2}
                                    contentContainerStyle={styles.photoGrid}
                                />

                                <View style={styles.bottomBar}>
                                    <TouchableOpacity
                                        onPress={() => { void handleDownload(selectedDetails.library.id); }}
                                        disabled={selectedLibraryIsDownloading || selectedLibraryAlreadyDownloaded}
                                        style={[
                                            styles.primaryButton,
                                            (selectedLibraryIsDownloading || selectedLibraryAlreadyDownloaded) && styles.disabledButton,
                                        ]}
                                    >
                                        {selectedLibraryIsDownloading ? (
                                            <ActivityIndicator size="small" color="white" />
                                        ) : selectedLibraryAlreadyDownloaded ? (
                                            <Text style={styles.primaryButtonText}>Already Downloaded</Text>
                                        ) : (
                                            <Text style={styles.primaryButtonText}>
                                                {!userId ? 'Sign in to download' : 'Download Library'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                ) : isLoading && marketLibraries.length === 0 ? (
                    <View style={styles.loadingState}>
                        <ActivityIndicator size="large" color={theme.colors.accent} />
                        <Text style={styles.loadingText}>Loading marketplace...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={marketLibraries}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMarketLibrary}
                        contentContainerStyle={marketLibraries.length === 0 ? styles.emptyContainer : styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={isRefreshing} onRefresh={() => { void refreshMarketLibraries(); }} />
                        }
                        ListHeaderComponent={
                            <View style={styles.filterPanel}>
                                <TextInput
                                    value={countryInput}
                                    onChangeText={setCountryInput}
                                    placeholder="Filter by country"
                                    placeholderTextColor={theme.colors.placeholder}
                                    style={styles.countryInput}
                                    returnKeyType="search"
                                    onSubmitEditing={handleApplyCountryFilter}
                                />
                                <TouchableOpacity onPress={handleApplyCountryFilter} style={styles.filterButton}>
                                    <Text style={styles.filterButtonText}>Apply</Text>
                                </TouchableOpacity>
                                {countryFilter ? (
                                    <TouchableOpacity onPress={handleClearCountryFilter} style={styles.clearFilterButton}>
                                        <Ionicons name="close" size={18} color="#475569" />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Ionicons name="storefront-outline" size={40} color={theme.colors.textMuted} />
                                <Text style={styles.emptyTitle}>No marketplace posts yet</Text>
                                <Text style={styles.emptyText}>Publish one of your custom libraries to start the marketplace.</Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingTop: 10,
        paddingBottom: 14,
    },
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    headerText: {
        flex: 1,
        marginLeft: 14,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: colors.text,
    },
    subtitle: {
        marginTop: 4,
        fontSize: 14,
        color: colors.textMuted,
    },
    headerAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563eb',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 9,
    },
    headerActionText: {
        color: 'white',
        fontWeight: '700',
    },
    loadingState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: colors.textMuted,
        fontSize: 15,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 30,
        gap: 14,
    },
    filterPanel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    countryInput: {
        flex: 1,
        height: 46,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.input,
        paddingHorizontal: 14,
        color: colors.text,
    },
    filterButton: {
        height: 46,
        borderRadius: 14,
        backgroundColor: '#2563eb',
        paddingHorizontal: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterButtonText: {
        color: 'white',
        fontWeight: '700',
    },
    clearFilterButton: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 22,
        padding: 14,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    coverImage: {
        width: '100%',
        height: 170,
        borderRadius: 18,
        backgroundColor: colors.surfaceMuted,
    },
    coverFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardBody: {
        paddingTop: 14,
    },
    cardTitleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    cardTitle: {
        flex: 1,
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
    },
    downloadedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        backgroundColor: '#dcfce7',
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    downloadedBadgeText: {
        color: '#166534',
        fontSize: 11,
        fontWeight: '800',
    },
    cardDescription: {
        marginTop: 6,
        fontSize: 14,
        color: colors.textMuted,
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 10,
    },
    metaText: {
        fontSize: 13,
        color: colors.textMuted,
        fontWeight: '600',
    },
    countryText: {
        alignSelf: 'flex-start',
        marginTop: 10,
        borderRadius: 999,
        backgroundColor: colors.accentSoft,
        color: colors.accentText,
        overflow: 'hidden',
        paddingHorizontal: 10,
        paddingVertical: 5,
        fontSize: 12,
        fontWeight: '700',
    },
    detailContent: {
        flex: 1,
    },
    detailHero: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 22,
        padding: 14,
        backgroundColor: colors.surface,
    },
    detailHeroImage: {
        width: 94,
        height: 94,
        borderRadius: 20,
        backgroundColor: colors.surfaceMuted,
    },
    detailHeroText: {
        flex: 1,
        marginLeft: 14,
        justifyContent: 'center',
    },
    detailTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    detailDescription: {
        marginTop: 6,
        color: colors.textMuted,
        lineHeight: 20,
    },
    photoGrid: {
        paddingHorizontal: 10,
        paddingBottom: 100,
    },
    photoCard: {
        flex: 1,
        margin: 6,
        borderRadius: 18,
        backgroundColor: colors.surface,
        overflow: 'hidden',
    },
    photoImage: {
        width: '100%',
        height: 130,
        backgroundColor: colors.surfaceMuted,
    },
    photoTitle: {
        padding: 10,
        color: colors.text,
        fontWeight: '700',
    },
    bottomBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: 16,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    primaryButton: {
        minHeight: 50,
        borderRadius: 16,
        backgroundColor: '#2563eb',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    primaryButtonText: {
        color: 'white',
        fontWeight: '800',
        fontSize: 15,
    },
    disabledButton: {
        opacity: 0.6,
    },
    publishContent: {
        padding: 16,
        paddingBottom: 32,
        gap: 12,
    },
    panel: {
        borderRadius: 22,
        padding: 16,
        backgroundColor: colors.surface,
    },
    panelTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
    },
    panelText: {
        marginTop: 6,
        color: colors.textMuted,
        lineHeight: 20,
    },
    descriptionInput: {
        minHeight: 92,
        marginTop: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
        color: colors.text,
        backgroundColor: colors.input,
        textAlignVertical: 'top',
    },
    publishLibraryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        padding: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 10,
    },
    publishLibraryCardSelected: {
        borderColor: colors.accent,
        backgroundColor: colors.accentSoft,
    },
    publishLibraryIcon: {
        marginRight: 12,
    },
    publishLibraryText: {
        flex: 1,
    },
    warningText: {
        marginTop: 6,
        color: '#b45309',
        fontSize: 13,
        fontWeight: '700',
    },
    publishSummary: {
        borderRadius: 22,
        padding: 16,
        backgroundColor: colors.surface,
        gap: 12,
    },
    summaryText: {
        color: colors.textSecondary,
        fontWeight: '700',
    },
    emptyContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    emptyState: {
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 28,
    },
    emptyTitle: {
        marginTop: 14,
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
    },
    emptyText: {
        marginTop: 8,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 21,
    },
});
