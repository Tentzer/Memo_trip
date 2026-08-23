import { type PendingInvite, useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
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
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface InvitesModalProps {
    visible: boolean;
    onClose: () => void;
}
function formatInviteDate(createdAt: string): string {
    return new Date(createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

export default function InvitesModal({ visible, onClose }: InvitesModalProps) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const {
        pendingInvites,
        invitesLoading,
        refreshPendingInvites,
        acceptMemoInvite,
        declineMemoInvite,
        acceptLibraryInvite,
        declineLibraryInvite,
    } = useMemories();

    const [processingKey, setProcessingKey] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        if (visible) {
            void refreshPendingInvites();
        }
    }, [visible, refreshPendingInvites]);

    const pendingCountLabel = useMemo(() => {
        if (pendingInvites.length === 1) return '1 pending invite';
        return `${pendingInvites.length} pending invites`;
    }, [pendingInvites.length]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await refreshPendingInvites();
        setIsRefreshing(false);
    }, [refreshPendingInvites]);

    const handleAccept = useCallback(async (invite: PendingInvite) => {
        const nextProcessingKey = `accept:${invite.type}:${invite.id}`;
        setProcessingKey(nextProcessingKey);

        const result = invite.type === 'memo'
            ? await acceptMemoInvite(invite.id)
            : await acceptLibraryInvite(invite.id, invite.libraryId);

        if (!result.success) {
            Alert.alert('Could not accept invite', result.message || 'Please try again.');
        }

        setProcessingKey(null);
    }, [acceptLibraryInvite, acceptMemoInvite]);

    const handleDecline = useCallback(async (invite: PendingInvite) => {
        const nextProcessingKey = `decline:${invite.type}:${invite.id}`;
        setProcessingKey(nextProcessingKey);

        const result = invite.type === 'memo'
            ? await declineMemoInvite(invite.id)
            : await declineLibraryInvite(invite.id);

        if (!result.success) {
            Alert.alert('Could not decline invite', result.message || 'Please try again.');
        }

        setProcessingKey(null);
    }, [declineLibraryInvite, declineMemoInvite]);

    const renderInviteCard = ({ item }: { item: PendingInvite }) => {
        const acceptKey = `accept:${item.type}:${item.id}`;
        const declineKey = `decline:${item.type}:${item.id}`;
        const isAccepting = processingKey === acceptKey;
        const isDeclining = processingKey === declineKey;
        const isBusy = isAccepting || isDeclining;

        return (
            <View style={styles.card}>
                <View style={styles.cardTopRow}>
                    <View style={[styles.typeBadge, item.type === 'memo' ? styles.memoBadge : styles.libraryBadge]}>
                        <Text style={styles.typeBadgeText}>{item.type === 'memo' ? 'Memo' : 'Library'}</Text>
                    </View>
                    <Text style={styles.dateText}>{formatInviteDate(item.createdAt)}</Text>
                </View>

                <View style={styles.cardBody}>
                    {item.type === 'memo' ? (
                        <ExpoImage
                            source={{ uri: item.imageUri }}
                            style={styles.previewImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    ) : item.previewImageUri ? (
                        <ExpoImage
                            source={{ uri: item.previewImageUri }}
                            style={styles.previewImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                    ) : (
                        <View style={[styles.previewImage, styles.libraryFallback]}>
                            <Ionicons name="folder-open-outline" size={28} color={theme.colors.textMuted} />
                        </View>
                    )}

                    <View style={styles.cardTextColumn}>
                        <Text style={styles.cardTitle}>
                            {item.type === 'memo' ? 'A memo was shared with you' : `${item.libraryName} was shared with you`}
                        </Text>
                        <Text style={styles.cardSubtitle}>
                            {item.senderEmail ? `From ${item.senderEmail}` : 'Shared with your account'}
                        </Text>
                        {item.type === 'library' ? (
                            <Text style={styles.cardMeta}>
                                {item.itemCount > 0 ? `${item.itemCount} photo${item.itemCount === 1 ? '' : 's'} included` : 'Library invite'}
                            </Text>
                        ) : null}
                    </View>
                </View>

                <View style={styles.cardActions}>
                    <TouchableOpacity
                        onPress={() => {
                            void handleDecline(item);
                        }}
                        disabled={isBusy}
                        style={[styles.declineButton, isBusy && styles.disabledButton]}
                    >
                        {isDeclining ? (
                            <ActivityIndicator size="small" color={theme.colors.textMuted} />
                        ) : (
                            <Text style={styles.declineButtonText}>Decline</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            void handleAccept(item);
                        }}
                        disabled={isBusy}
                        style={[styles.acceptButton, isBusy && styles.disabledButton]}
                    >
                        {isAccepting ? (
                            <ActivityIndicator size="small" color="white" />
                        ) : (
                            <Text style={styles.acceptButtonText}>Accept</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.screen}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
                    </TouchableOpacity>
                    <View style={styles.headerText}>
                        <Text style={styles.title}>Invites</Text>
                        <Text style={styles.subtitle}>{pendingCountLabel}</Text>
                    </View>
                </View>

                {invitesLoading && pendingInvites.length === 0 ? (
                    <View style={styles.loadingState}>
                        <ActivityIndicator size="large" color={theme.colors.accent} />
                        <Text style={styles.loadingText}>Loading invites...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={pendingInvites}
                        keyExtractor={(item) => `${item.type}-${item.id}`}
                        renderItem={renderInviteCard}
                        contentContainerStyle={pendingInvites.length === 0 ? styles.emptyContainer : styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={isRefreshing} onRefresh={() => { void handleRefresh(); }} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Ionicons name="mail-open-outline" size={40} color={theme.colors.textMuted} />
                                <Text style={styles.emptyTitle}>No pending invites</Text>
                                <Text style={styles.emptyText}>
                                    When someone shares a memo or library with you, it will appear here.
                                </Text>
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
    card: {
        backgroundColor: colors.surface,
        borderRadius: 22,
        padding: 16,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    cardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    typeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    memoBadge: {
        backgroundColor: '#dcfce7',
    },
    libraryBadge: {
        backgroundColor: '#ede9fe',
    },
    typeBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    dateText: {
        fontSize: 12,
        color: colors.textMuted,
    },
    cardBody: {
        flexDirection: 'row',
        marginTop: 14,
    },
    previewImage: {
        width: 74,
        height: 74,
        borderRadius: 18,
        backgroundColor: colors.surfaceMuted,
    },
    libraryFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTextColumn: {
        flex: 1,
        marginLeft: 14,
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    cardSubtitle: {
        marginTop: 6,
        fontSize: 14,
        color: colors.textSecondary,
    },
    cardMeta: {
        marginTop: 6,
        fontSize: 13,
        color: colors.textMuted,
    },
    cardActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 16,
    },
    declineButton: {
        minWidth: 96,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
    },
    declineButtonText: {
        color: colors.textSecondary,
        fontWeight: '700',
    },
    acceptButton: {
        minWidth: 96,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 14,
        backgroundColor: '#2563eb',
        alignItems: 'center',
    },
    acceptButtonText: {
        color: 'white',
        fontWeight: '700',
    },
    disabledButton: {
        opacity: 0.7,
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
    },
    emptyText: {
        marginTop: 8,
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 21,
    },
});
