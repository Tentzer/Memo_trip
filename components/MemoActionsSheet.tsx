import { type Memory } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
    memory: Memory;
    onClose: () => void;
    onOpenInfo: () => void;
    onStartWalkingRoute: () => void;
    onOpenDrivingRoute: () => void;
    onShare: () => void;
    onDelete: () => void;
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

function ActionButton({
    icon,
    label,
    onPress,
    destructive = false,
    colors,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress: () => void;
    destructive?: boolean;
    colors: ThemeColors;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            style={[
                styles.actionButton,
                {
                    backgroundColor: destructive ? colors.dangerSoft : colors.accentSoft,
                    borderColor: destructive ? colors.danger : colors.border,
                },
            ]}
        >
            <Ionicons
                name={icon}
                size={20}
                color={destructive ? colors.danger : colors.accent}
            />
            <Text style={[styles.actionLabel, { color: destructive ? colors.danger : colors.text }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

export default function MemoActionsSheet({
    memory,
    onClose,
    onOpenInfo,
    onStartWalkingRoute,
    onOpenDrivingRoute,
    onShare,
    onDelete,
}: Props) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
    const translateY = useSharedValue(600);
    const backdropOpacity = useSharedValue(0);

    useEffect(() => {
        backdropOpacity.value = withTiming(1, { duration: 220 });
        translateY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dismiss = useCallback((afterClose?: () => void) => {
        backdropOpacity.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(600, { duration: 240 }, (finished) => {
            if (finished) {
                if (afterClose) runOnJS(afterClose)();
                runOnJS(onClose)();
            }
        });
    }, [backdropOpacity, translateY, onClose]);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    const title = memory.title?.trim() || memory.country || 'Memo';
    const subtitle = memory.description?.trim() || 'Choose what to do with this memo.';

    return (
        <Modal
            visible
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={() => dismiss()}
        >
            <View style={styles.container} pointerEvents="box-none">
                <TouchableWithoutFeedback onPress={() => dismiss()}>
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            styles.backdrop,
                            backdropStyle,
                        ]}
                    />
                </TouchableWithoutFeedback>

                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: theme.colors.surface,
                            paddingBottom: Math.max(insets.bottom, 16) + 8,
                            shadowColor: theme.colors.shadow,
                        },
                        sheetStyle,
                    ]}
                >
                    <View style={[styles.handle, { backgroundColor: theme.colors.handle }]} />

                    <View style={styles.previewRow}>
                        <ExpoImage
                            source={{ uri: memory.uri }}
                            style={[styles.previewImage, { backgroundColor: theme.colors.surfaceMuted }]}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                        <View style={styles.previewTextBlock}>
                            <Text
                                style={[styles.previewTitle, { color: theme.colors.text }]}
                                numberOfLines={1}
                            >
                                {title}
                            </Text>
                            <Text
                                style={[styles.previewSubtitle, { color: theme.colors.textMuted }]}
                                numberOfLines={2}
                            >
                                {subtitle}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

                    <View style={styles.actionsGrid}>
                        <ActionButton
                            icon="information-circle-outline"
                            label="Info"
                            onPress={() => dismiss(onOpenInfo)}
                            colors={theme.colors}
                        />
                        <ActionButton
                            icon="walk-outline"
                            label="Walk"
                            onPress={() => dismiss(onStartWalkingRoute)}
                            colors={theme.colors}
                        />
                        <ActionButton
                            icon="navigate-outline"
                            label="Drive"
                            onPress={() => dismiss(onOpenDrivingRoute)}
                            colors={theme.colors}
                        />
                        {!memory.isShared && (
                            <>
                                <ActionButton
                                    icon="share-social-outline"
                                    label="Share"
                                    onPress={() => dismiss(onShare)}
                                    colors={theme.colors}
                                />
                                <ActionButton
                                    icon="trash-outline"
                                    label="Delete"
                                    onPress={() => dismiss(onDelete)}
                                    colors={theme.colors}
                                    destructive
                                />
                            </>
                        )}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.48)',
    },
    sheet: {
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        paddingHorizontal: 18,
        paddingTop: 10,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 20,
    },
    handle: {
        width: 42,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 18,
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    previewImage: {
        width: 62,
        height: 62,
        borderRadius: 14,
    },
    previewTextBlock: {
        flex: 1,
        marginLeft: 14,
    },
    previewTitle: {
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    previewSubtitle: {
        marginTop: 3,
        fontSize: 13,
        lineHeight: 18,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginBottom: 16,
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: 16,
        borderWidth: 1,
        minWidth: '30%',
        flexGrow: 1,
        flexBasis: '30%',
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
});
