import { type Memory } from '@/context/MemoryContext';
import { getFormattedAddressFromCoords } from '@/lib/geocoding';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
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
    /** When true (e.g. shared library viewer), fields are read-only. */
    readOnly?: boolean;
    onClose: () => void;
    onSave: (title: string, description: string) => void;
}

export default function MemoInfoModal({ visible, memory, readOnly = false, onClose, onSave }: Props) {
    const [memoTitle, setMemoTitle] = useState('');
    const [memoDescription, setMemoDescription] = useState('');
    const [address, setAddress] = useState('');
    const [addressLoading, setAddressLoading] = useState(false);

    useEffect(() => {
        if (!visible || !memory) {
            setAddress('');
            return;
        }
        setMemoTitle(memory.title ?? '');
        setMemoDescription(memory.description ?? '');
        setAddressLoading(true);
        setAddress('');
        let cancelled = false;
        getFormattedAddressFromCoords(memory.latitude, memory.longitude).then((text) => {
            if (!cancelled) {
                setAddress(text);
            }
        }).finally(() => {
            if (!cancelled) setAddressLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [visible, memory]);

    const handleClose = () => {
        Keyboard.dismiss();
        onClose();
    };

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
                <View style={styles.sheet} onStartShouldSetResponder={() => true}>
                    <View style={styles.handleBar} />
                    <Text style={styles.heading}>Memo details</Text>
                    <Text style={styles.lead}>
                        {readOnly
                            ? 'Shared memo — you can view details only.'
                            : 'Name this memo and add an optional note for your library.'}
                    </Text>

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
                                <Ionicons name="location-outline" size={18} color="#475569" />
                                <Text style={styles.label}>Address</Text>
                            </View>
                            {addressLoading ? (
                                <View style={styles.addressLoading}>
                                    <ActivityIndicator size="small" color="#64748b" />
                                    <Text style={styles.muted}>Looking up address…</Text>
                                </View>
                            ) : (
                                <Text style={styles.bodyText}>
                                    {address || 'Address unavailable for this location.'}
                                </Text>
                            )}
                        </View>

                        <View style={styles.block}>
                            <View style={styles.labelRow}>
                                <Ionicons name="text-outline" size={18} color="#475569" />
                                <Text style={styles.label}>Title</Text>
                            </View>
                            {editable ? (
                                <TextInput
                                    value={memoTitle}
                                    onChangeText={setMemoTitle}
                                    placeholder="Memo name"
                                    placeholderTextColor="#94a3b8"
                                    maxLength={60}
                                    className="h-12 border border-gray-200 rounded-xl px-4 text-slate-800 font-medium"
                                    returnKeyType="next"
                                />
                            ) : (
                                <Text style={styles.bodyText}>{memoTitle || '—'}</Text>
                            )}
                        </View>

                        <View style={styles.block}>
                            <View style={styles.labelRow}>
                                <Ionicons name="document-text-outline" size={18} color="#475569" />
                                <Text style={styles.label}>Description</Text>
                            </View>
                            {editable ? (
                                <TextInput
                                    value={memoDescription}
                                    onChangeText={setMemoDescription}
                                    placeholder="Description (optional)"
                                    placeholderTextColor="#94a3b8"
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
                        className={`${editable ? 'mt-3' : 'mt-4'} p-3 bg-gray-100 rounded-xl items-center`}
                    >
                        <Text className="text-gray-600 font-semibold">Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    backdropTap: {
        ...StyleSheet.absoluteFillObject,
    },
    sheet: {
        maxHeight: '88%',
        backgroundColor: '#ffffff',
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
        backgroundColor: '#e2e8f0',
        marginBottom: 12,
    },
    heading: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0f172a',
    },
    lead: {
        color: '#64748b',
        marginTop: 6,
        marginBottom: 12,
        lineHeight: 20,
        fontSize: 14,
    },
    scroll: {
        maxHeight: 420,
    },
    heroImage: {
        width: '100%',
        height: 200,
        borderRadius: 16,
        backgroundColor: '#e2e8f0',
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
        color: '#334155',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 24,
        color: '#0f172a',
    },
    muted: {
        marginLeft: 10,
        fontSize: 14,
        color: '#64748b',
    },
    addressLoading: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    descriptionInput: {
        minHeight: 100,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: '#0f172a',
        fontSize: 16,
    },
});
