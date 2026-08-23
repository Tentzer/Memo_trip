import { type Memory } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import {
    getCachedFormattedAddressFromCoords,
    getFormattedAddressFromCoords,
} from '@/lib/geocoding';
import { getSourcePlatform } from '@/lib/sourcePlatform';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    InteractionManager,
    Keyboard,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Props {
    visible: boolean;
    memory: Memory | null;
    readOnly?: boolean;
    onClose: () => void;
    onSave: (title: string, description: string) => void;
}

export default function MemoInfoModal({ visible, memory, readOnly = false, onClose, onSave }: Props) {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [memoTitle, setMemoTitle] = useState('');
    const [memoDescription, setMemoDescription] = useState('');
    const [address, setAddress] = useState('');
    const [addressLoading, setAddressLoading] = useState(false);

    useEffect(() => {
        if (!memory) {
            setMemoTitle('');
            setMemoDescription('');
            setAddress('');
            setAddressLoading(false);
            return;
        }

        setMemoTitle(memory.title ?? '');
        setMemoDescription(memory.description ?? '');

        if (!visible) {
            setAddress('');
            setAddressLoading(false);
            return;
        }

        const cachedAddress = getCachedFormattedAddressFromCoords(memory.latitude, memory.longitude);
        setAddress(cachedAddress ?? '');
        setAddressLoading(cachedAddress === null);

        let cancelled = false;
        const interactionTask = cachedAddress === null
            ? InteractionManager.runAfterInteractions(() => {
                getFormattedAddressFromCoords(memory.latitude, memory.longitude).then((text) => {
                    if (!cancelled) {
                        setAddress(text);
                    }
                }).finally(() => {
                    if (!cancelled) {
                        setAddressLoading(false);
                    }
                });
            })
            : null;

        return () => {
            cancelled = true;
            interactionTask?.cancel();
        };
    }, [visible, memory]);

    const handleClose = () => {
        Keyboard.dismiss();
        onClose();
    };

    const handleOpenSourceUrl = useCallback(async () => {
        if (!memory?.sourceUrl) return;
        try {
            await Linking.openURL(memory.sourceUrl);
        } catch {
            Alert.alert('Could not open link', 'Please try again later.');
        }
    }, [memory]);

    const sourcePlatform = getSourcePlatform(memory?.sourceUrl);

    const handleOpenGoogleMaps = useCallback(async () => {
        if (!memory) return;

        const textQuery = [
            memoTitle || memory.title,
            address,
            memory.country,
        ]
            .filter(value => value?.trim())
            .join(', ');
        const query = textQuery || `${memory.latitude},${memory.longitude}`;
        const nativeUrl = `comgooglemaps://?q=${encodeURIComponent(query)}`;
        const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

        try {
            let useNative = false;
            try {
                useNative = await Linking.canOpenURL(nativeUrl);
            } catch {
                try {
                    await Linking.openURL(nativeUrl);
                    return;
                } catch {
                    // Fall through to web link.
                }
            }

            await Linking.openURL(useNative ? nativeUrl : webUrl);
        } catch {
            Alert.alert('Could not open Google Maps', 'Please try again later.');
        }
    }, [address, memoTitle, memory]);

    const editable = !readOnly;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdropTap} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" />
                <View style={styles.sheet}>
                    <View style={styles.handleBar} />
                    <Text style={styles.heading}>Memo details</Text>

                    <ScrollView
                        style={styles.scroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {memory ? (
                            <ExpoImage
                                source={{ uri: memory.uri }}
                                style={styles.heroImage}
                                contentFit="cover"
                                transition={200}
                            />
                        ) : null}

                        <View style={styles.block}>
                            <View style={styles.labelRow}>
                                <Ionicons name="location-outline" size={18} color={theme.colors.textMuted} />
                                <Text style={styles.label}>Address</Text>
                            </View>
                            {addressLoading ? (
                                <View style={styles.addressLoading}>
                                    <ActivityIndicator size="small" color={theme.colors.textMuted} />
                                    <Text style={styles.muted}>Looking up address…</Text>
                                </View>
                            ) : (
                                <Text style={styles.bodyText}>
                                    {address || 'Address unavailable for this location.'}
                                </Text>
                            )}
                            {memory ? (
                                <View style={styles.actionRow}>
                                    <TouchableOpacity
                                        onPress={handleOpenGoogleMaps}
                                        style={styles.googleButton}
                                    >
                                        <Ionicons name="navigate-outline" size={15} color={theme.colors.accent} />
                                        <Text style={styles.googleButtonText}>
                                            <Text style={styles.googleBlue}>G</Text>
                                            <Text style={styles.googleRed}>o</Text>
                                            <Text style={styles.googleYellow}>o</Text>
                                            <Text style={styles.googleBlue}>g</Text>
                                            <Text style={styles.googleGreen}>l</Text>
                                            <Text style={styles.googleRed}>e</Text>
                                            <Text style={styles.googleMapsText}> Maps</Text>
                                        </Text>
                                    </TouchableOpacity>
                                    {memory.source === 'video_import' && !!memory.sourceUrl && !!sourcePlatform && (
                                        <TouchableOpacity onPress={handleOpenSourceUrl} activeOpacity={0.8}>
                                            {sourcePlatform === 'instagram' ? (
                                                <LinearGradient
                                                    colors={['#f9ce34', '#ee2a7b', '#6228d7']}
                                                    start={{ x: 0, y: 1 }}
                                                    end={{ x: 1, y: 0 }}
                                                    style={styles.sourceButton}
                                                >
                                                    <Ionicons name="logo-instagram" size={15} color="#fff" />
                                                    <Text style={styles.sourceButtonText}>View post</Text>
                                                </LinearGradient>
                                            ) : sourcePlatform === 'tiktok' ? (
                                                <View style={[styles.sourceButton, { backgroundColor: '#010101' }]}>
                                                    <Ionicons name="logo-tiktok" size={15} color="#fff" />
                                                    <Text style={styles.sourceButtonText}>View post</Text>
                                                </View>
                                            ) : (
                                                <View style={[styles.sourceButton, { backgroundColor: '#1877f2' }]}>
                                                    <Ionicons name="logo-facebook" size={15} color="#fff" />
                                                    <Text style={styles.sourceButtonText}>View post</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : null}
                        </View>

                        <View style={styles.block}>
                            <View style={styles.labelRow}>
                                <Ionicons name="text-outline" size={18} color={theme.colors.textMuted} />
                                <Text style={styles.label}>Title</Text>
                            </View>
                            {editable ? (
                                <TextInput
                                    value={memoTitle}
                                    onChangeText={setMemoTitle}
                                    placeholder="Memo name"
                                    placeholderTextColor={theme.colors.placeholder}
                                    maxLength={60}
                                    style={styles.titleInput}
                                    returnKeyType="next"
                                />
                            ) : (
                                <Text style={styles.bodyText}>{memoTitle || '—'}</Text>
                            )}
                        </View>

                        <View style={styles.block}>
                            <View style={styles.labelRow}>
                                <Ionicons name="document-text-outline" size={18} color={theme.colors.textMuted} />
                                <Text style={styles.label}>Description</Text>
                            </View>
                            {editable ? (
                                <TextInput
                                    value={memoDescription}
                                    onChangeText={setMemoDescription}
                                    placeholder="Description (optional)"
                                    placeholderTextColor={theme.colors.placeholder}
                                    multiline={true}
                                    textAlignVertical="top"
                                    style={styles.descriptionInput}
                                />
                            ) : (
                                <Text style={styles.bodyText}>{memoDescription || '—'}</Text>
                            )}
                        </View>
                    </ScrollView>

                    {editable ? (
                        <TouchableOpacity
                            onPress={() => onSave(memoTitle, memoDescription)}
                            className="mt-3 p-4 bg-emerald-700 rounded-xl items-center shadow-sm"
                        >
                            <Text className="text-white font-bold text-base">Save</Text>
                        </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                        onPress={handleClose}
                        style={[styles.closeButton, editable ? styles.closeButtonEditable : styles.closeButtonReadOnly]}
                    >
                        <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-end',
    },
    backdropTap: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        maxHeight: '88%',
        backgroundColor: colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingBottom: 28,
        paddingTop: 10,
    },
    handleBar: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.handle,
        marginBottom: 12,
    },
    heading: {
        fontSize: 20,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 12,
    },
    scroll: {
        maxHeight: 420,
    },
    heroImage: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        backgroundColor: colors.surfaceMuted,
        marginBottom: 16,
    },
    block: {
        marginBottom: 18,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 24,
        color: colors.text,
    },
    muted: {
        marginLeft: 10,
        fontSize: 14,
        color: colors.textMuted,
    },
    addressLoading: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    googleButton: {
        borderRadius: 999,
        backgroundColor: colors.accentSoft,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    sourceButton: {
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    sourceButtonText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },
    googleButtonText: {
        fontSize: 13,
        fontWeight: '700',
    },
    googleBlue: {
        color: '#4285f4',
    },
    googleRed: {
        color: '#ea4335',
    },
    googleYellow: {
        color: '#fbbc05',
    },
    googleGreen: {
        color: '#34a853',
    },
    googleMapsText: {
        color: colors.textSecondary,
    },
    titleInput: {
        height: 48,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        color: colors.text,
        backgroundColor: colors.input,
        fontWeight: '500',
    },
    descriptionInput: {
        minHeight: 100,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: colors.text,
        backgroundColor: colors.input,
        fontSize: 16,
    },
    closeButton: {
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: colors.surfaceMuted,
    },
    closeButtonEditable: {
        marginTop: 12,
    },
    closeButtonReadOnly: {
        marginTop: 16,
    },
    closeButtonText: {
        color: colors.textSecondary,
        fontWeight: '600',
    },
});

