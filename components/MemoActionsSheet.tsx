import { type Memory } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);

    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.actionButton, destructive && styles.destructiveButton]}
            activeOpacity={0.85}
        >
            <Ionicons name={icon} size={18} color={destructive ? theme.colors.danger : theme.colors.text} />
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
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const bottomSheetRef = useRef<BottomSheet>(null);

    useEffect(() => {
        if (visible && memory) {
            bottomSheetRef.current?.expand();
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible, memory]);

    const renderBackdrop = useCallback(
        (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
        ),
        [],
    );

    const title = memory?.title?.trim() || memory?.country || 'Memo';
    const subtitle = memory?.description?.trim() || 'Choose what you want to do with this memo.';

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            enableDynamicSizing
            enablePanDownToClose
            onClose={onClose}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={styles.handleIndicator}
            backgroundStyle={styles.sheetBackground}
            style={styles.sheetContainer}
        >
            {memory ? (
                <BottomSheetView style={styles.sheetContent}>
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
                                <ActionButton
                                    icon="trash-outline"
                                    label={deleteLabel}
                                    onPress={onDelete}
                                    destructive
                                />
                            </>
                        ) : null}
                    </View>
                </BottomSheetView>
            ) : null}
        </BottomSheet>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    sheetContainer: {
        zIndex: 950,
    },
    sheetBackground: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    handleIndicator: {
        width: 44,
        backgroundColor: colors.handle,
    },
    sheetContent: {
        paddingHorizontal: 18,
        paddingBottom: 28,
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    previewImage: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: colors.surfaceMuted,
    },
    previewText: {
        flex: 1,
        marginLeft: 14,
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        lineHeight: 18,
        color: colors.textMuted,
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
        backgroundColor: colors.accentSoft,
        borderWidth: 1,
        borderColor: colors.border,
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    destructiveButton: {
        backgroundColor: colors.dangerSoft,
        borderColor: colors.danger,
    },
    destructiveLabel: {
        color: colors.danger,
    },
});
