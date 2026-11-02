import type { RelatedLibraryFilterOption } from '@/hooks/useMapLibraryFilter';
import { UNKNOWN_COUNTRY_FOLDER } from '@/lib/countryFolder';
import type { MapLibraryFilter } from '@/lib/mapMemoryPins';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MapLibraryFilterControlProps = {
    top: number;
    activeMapLibraryFilter: MapLibraryFilter | null;
    isVisible: boolean;
    currentGpsCountry: string | null;
    isCountryLoading: boolean;
    options: RelatedLibraryFilterOption[];
    selectedLibraryIds: string[];
    onToggle: () => void;
    onClose: () => void;
    onToggleLibrary: (folderId: string) => void;
    onClear: () => void;
    onApply: () => void;
};

export default function MapLibraryFilterControl({
    top,
    activeMapLibraryFilter,
    isVisible,
    currentGpsCountry,
    isCountryLoading,
    options,
    selectedLibraryIds,
    onToggle,
    onClose,
    onToggleLibrary,
    onClear,
    onApply,
}: MapLibraryFilterControlProps) {
    const { theme } = useAppTheme();
    const highlighted = activeMapLibraryFilter?.mode === 'custom-multi';
    const countryLabel = currentGpsCountry && currentGpsCountry !== UNKNOWN_COUNTRY_FOLDER
        ? currentGpsCountry
        : 'Nearby';

    return (
        <>
            <TouchableOpacity
                onPress={onToggle}
                style={[
                    styles.filterButton,
                    {
                        top,
                        backgroundColor: theme.colors.surface,
                        borderColor: highlighted ? theme.colors.accent : theme.colors.border,
                    },
                ]}
            >
                <Ionicons
                    name="funnel-outline"
                    size={26}
                    color={highlighted ? theme.colors.accent : theme.colors.textSecondary}
                />
            </TouchableOpacity>

            {isVisible ? (
                <View
                    style={[
                        styles.libraryFilterPopover,
                        {
                            top: top + 54,
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <View style={styles.libraryFilterHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.libraryFilterTitle, { color: theme.colors.text }]}>
                                {countryLabel}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={8}>
                            <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {isCountryLoading ? (
                        <View style={styles.libraryFilterEmpty}>
                            <ActivityIndicator size="small" color={theme.colors.accent} />
                            <Text style={[styles.libraryFilterEmptyText, { color: theme.colors.textMuted }]}>
                                Finding your current country...
                            </Text>
                        </View>
                    ) : options.length === 0 ? (
                        <View style={styles.libraryFilterEmpty}>
                            <Ionicons name="folder-open-outline" size={28} color={theme.colors.textMuted} />
                            <Text style={[styles.libraryFilterEmptyText, { color: theme.colors.textMuted }]}>
                                No related libraries found here.
                            </Text>
                        </View>
                    ) : (
                        <>
                            <ScrollView style={styles.libraryFilterList} showsVerticalScrollIndicator={false}>
                                {options.map((option) => {
                                    const isSelected = selectedLibraryIds.includes(option.id);
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            onPress={() => onToggleLibrary(option.id)}
                                            style={[
                                                styles.libraryFilterRow,
                                                {
                                                    backgroundColor: isSelected ? theme.colors.accentSoft : theme.colors.surfaceMuted,
                                                    borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                                                },
                                            ]}
                                        >
                                            {option.coverImageUrl ? (
                                                <ExpoImage
                                                    source={{ uri: option.coverImageUrl }}
                                                    style={styles.libraryFilterCover}
                                                    contentFit="cover"
                                                    cachePolicy="memory-disk"
                                                />
                                            ) : (
                                                <View style={[styles.libraryFilterCoverFallback, { backgroundColor: theme.colors.accentSoft }]}>
                                                    <Ionicons name="folder-open" size={18} color={theme.colors.accent} />
                                                </View>
                                            )}
                                            <View style={styles.libraryFilterRowText}>
                                                <Text style={[styles.libraryFilterOptionName, { color: theme.colors.text }]} numberOfLines={1}>
                                                    {option.name}
                                                </Text>
                                            </View>
                                            <Ionicons
                                                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                                size={22}
                                                color={isSelected ? theme.colors.accent : theme.colors.borderStrong}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            <View style={styles.libraryFilterActions}>
                                <TouchableOpacity
                                    onPress={onClear}
                                    style={[styles.libraryFilterSecondaryAction, { borderColor: theme.colors.border }]}
                                >
                                    <Text style={[styles.libraryFilterSecondaryText, { color: theme.colors.textSecondary }]}>
                                        Clear
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={onApply}
                                    style={[styles.libraryFilterPrimaryAction, { backgroundColor: theme.colors.accent }]}
                                >
                                    <Text style={styles.libraryFilterPrimaryText}>Apply</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            ) : null}
        </>
    );
}

const styles = StyleSheet.create({
    filterButton: {
        position: 'absolute',
        right: 76,
        backgroundColor: 'transparent',
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        elevation: 10,
        zIndex: 1000,
    },
    libraryFilterPopover: {
        position: 'absolute',
        right: 76,
        width: 292,
        maxHeight: 384,
        borderRadius: 22,
        borderWidth: 1,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 12,
        zIndex: 1001,
    },
    libraryFilterHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 12,
    },
    libraryFilterTitle: {
        fontSize: 16,
        fontWeight: '800',
    },
    libraryFilterList: {
        maxHeight: 220,
    },
    libraryFilterRow: {
        minHeight: 58,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    libraryFilterCover: {
        width: 40,
        height: 40,
        borderRadius: 12,
    },
    libraryFilterCoverFallback: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterRowText: {
        flex: 1,
    },
    libraryFilterOptionName: {
        fontSize: 14,
        fontWeight: '700',
    },
    libraryFilterActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 6,
    },
    libraryFilterSecondaryAction: {
        flex: 1,
        height: 42,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterPrimaryAction: {
        flex: 1,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    libraryFilterSecondaryText: {
        fontSize: 14,
        fontWeight: '700',
    },
    libraryFilterPrimaryText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
    },
    libraryFilterEmpty: {
        minHeight: 118,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 18,
    },
    libraryFilterEmptyText: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
});
