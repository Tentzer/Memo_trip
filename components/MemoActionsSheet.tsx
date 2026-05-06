import { type Memory } from '@/context/MemoryContext';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
    visible: boolean;
    memory: Memory | null;
    onClose: () => void;
    onOpenInfo: () => void;
    onStartWalkingRoute: () => void;
    onOpenDrivingRoute: () => void;
    onShare: () => void;
    onDelete: () => void;
    deleteLabel?: string;
}

function ActionButton({
    icon,
    label,
    onPress,
    destructive = false,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress: () => void;
    destructive?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.actionButton, destructive && styles.destructiveButton]}
            activeOpacity={0.85}
        >
            <Ionicons name={icon} size={18} color={destructive ? '#b91c1c' : '#0f172a'} />
            <Text style={[styles.actionLabel, destructive && styles.destructiveLabel]}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function MemoActionsSheet({
    visible,
    memory,
    onClose,
    onOpenInfo,
    onStartWalkingRoute,
    onOpenDrivingRoute,
    onShare,
    onDelete,
    deleteLabel = 'Delete',
}: Props) {
    if (!visible || !memory) return null;

    const title = memory.title?.trim() || memory.country || 'Memo';
    const subtitle = memory.description?.trim() || 'Choose what you want to do with this memo.';

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />

                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                    <View style={styles.handle} />

                    <View style={styles.previewRow}>
                        <ExpoImage
                            source={{ uri: memory.uri }}
                            style={styles.previewImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />

                        <View style={styles.previewText}>
                            <Text style={styles.title} numberOfLines={1}>
                                {title}
                            </Text>
                            <Text style={styles.subtitle} numberOfLines={2}>
                                {subtitle}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.actionsGrid}>
                        <ActionButton icon="information-circle-outline" label="Info" onPress={onOpenInfo} />
                        <ActionButton icon="walk-outline" label="Walk" onPress={onStartWalkingRoute} />
                        <ActionButton icon="navigate-outline" label="Drive" onPress={onOpenDrivingRoute} />
                        {!memory.isShared ? (
                            <>
                                <ActionButton icon="share-social-outline" label="Share" onPress={onShare} />
                                <ActionButton icon="trash-outline" label={deleteLabel} onPress={onDelete} destructive />
                            </>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 950,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
    },
    sheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 28,
        shadowColor: '#0f172a',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 12,
    },
    handle: {
        width: 44,
        height: 5,
        borderRadius: 999,
        backgroundColor: '#cbd5e1',
        alignSelf: 'center',
        marginBottom: 16,
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    previewImage: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: '#e2e8f0',
    },
    previewText: {
        flex: 1,
        marginLeft: 14,
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0f172a',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        lineHeight: 18,
        color: '#64748b',
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 18,
    },
    actionButton: {
        minWidth: '30%',
        flexGrow: 1,
        flexBasis: '30%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 16,
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#dbeafe',
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0f172a',
    },
    destructiveButton: {
        backgroundColor: '#fef2f2',
        borderColor: '#fecaca',
    },
    destructiveLabel: {
        color: '#b91c1c',
    },
});
