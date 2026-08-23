import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '@/context/ThemeContext';
import type { ModalPlace } from '@/types/videoImport';

/** Same gradient as video-import map marker rings (Home.tsx). */
const IG_GRADIENT = ['#f9ce34', '#ee2a7b', '#6228d7'] as const;
const SAVED_COLOR = '#22c55e';

interface Props {
    place: ModalPlace;
    photoUri?: string;
    isSaving: boolean;
    isSaved: boolean;
    saveError: string | null;
    onAdd: () => void;
}

const PLACEHOLDER = 'https://placehold.co/120x120/e2e8f0/94a3b8.png?text=?';

export default function ImportCandidateCard({
    place,
    photoUri,
    isSaving,
    isSaved,
    saveError,
    onAdd,
}: Props) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);

    const renderAddControl = () => {
        if (isSaving) {
            return (
                <View style={[styles.addBtn, styles.addBtnBusy]}>
                    <ActivityIndicator size="small" color="#fff" />
                </View>
            );
        }
        if (isSaved) {
            return (
                <View style={[styles.addBtn, styles.addBtnSaved]}>
                    <Ionicons name="checkmark" size={22} color="#fff" />
                </View>
            );
        }
        return (
            <LinearGradient
                colors={IG_GRADIENT}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.addBtnRing}
            >
                <View style={styles.addBtnInner}>
                    <Ionicons name="add" size={22} color={theme.colors.text} />
                </View>
            </LinearGradient>
        );
    };

    return (
        <View style={styles.card}>
            <Image
                source={{ uri: photoUri ?? PLACEHOLDER }}
                style={styles.photo}
                contentFit="cover"
            />
            <View style={styles.body}>
                <Text style={styles.name} numberOfLines={2}>{place.name}</Text>
                {!!place.description && (
                    <Text style={styles.description} numberOfLines={3}>{place.description}</Text>
                )}
                {!!saveError && <Text style={styles.errorText}>{saveError}</Text>}
            </View>
            <TouchableOpacity
                onPress={onAdd}
                disabled={isSaving || isSaved}
                activeOpacity={0.75}
                hitSlop={8}
            >
                {renderAddControl()}
            </TouchableOpacity>
        </View>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    photo: {
        width: 72,
        height: 72,
        borderRadius: 10,
        backgroundColor: colors.surfaceMuted,
    },
    body: {
        flex: 1,
        gap: 4,
        marginRight: 4,
    },
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    description: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    errorText: { fontSize: 12, color: '#EF4444' },
    addBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
    },
    addBtnRing: {
        width: 40,
        height: 40,
        borderRadius: 20,
        flexShrink: 0,
        overflow: 'hidden',
    },
    addBtnInner: {
        flex: 1,
        margin: 2,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },
    addBtnBusy: {
        backgroundColor: '#ee2a7b',
    },
    addBtnSaved: {
        backgroundColor: SAVED_COLOR,
    },
});
