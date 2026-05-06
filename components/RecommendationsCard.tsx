import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { RecommendedPlace } from '@/types/plan';

interface Props {
    places: RecommendedPlace[];
    onSaveToMemories: (place: RecommendedPlace) => Promise<void>;
}

export default function RecommendationsCard({ places, onSaveToMemories }: Props) {
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

    const handleSave = async (place: RecommendedPlace) => {
        if (savingId || savedIds.has(place.placeId)) return;
        setSavingId(place.placeId);
        try {
            await onSaveToMemories(place);
            setSavedIds((prev) => new Set(prev).add(place.placeId));
        } finally {
            setSavingId(null);
        }
    };

    return (
        <View style={styles.container}>
            {places.map((place, idx) => {
                const isSaving = savingId === place.placeId;
                const isSaved = savedIds.has(place.placeId);

                return (
                    <View
                        key={place.placeId}
                        style={[styles.row, idx < places.length - 1 && styles.rowBorder]}
                    >
                        <View style={styles.badgeColumn}>
                            <View style={styles.numberBadge}>
                                <Text style={styles.numberText}>{idx + 1}</Text>
                            </View>
                        </View>

                        <View style={styles.textColumn}>
                            <View style={styles.nameRow}>
                                <Text style={styles.placeName} numberOfLines={2}>
                                    {place.name}
                                </Text>
                                <View style={styles.ratingPill}>
                                    <Ionicons name="star" size={11} color="#F59E0B" />
                                    <Text style={styles.ratingText}>
                                        {place.rating.toFixed(1)}
                                    </Text>
                                </View>
                            </View>

                            {!!place.description && (
                                <Text style={styles.description} numberOfLines={2}>
                                    {place.description}
                                </Text>
                            )}

                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.saveButton, isSaved && styles.saveButtonDone]}
                                    onPress={() => handleSave(place)}
                                    disabled={isSaving || isSaved}
                                    activeOpacity={0.75}
                                >
                                    {isSaving ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : isSaved ? (
                                        <>
                                            <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                                            <Text style={styles.buttonText}>Saved</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Ionicons name="bookmark-outline" size={14} color="#FFFFFF" />
                                            <Text style={styles.buttonText}>Save to memories</Text>
                                        </>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.googleButton}
                                    onPress={() => {
                                        const q = [place.name, place.address].filter(Boolean).join(' ');
                                        Linking.openURL(
                                            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
                                        );
                                    }}
                                    activeOpacity={0.75}
                                >
                                    <Ionicons name="search" size={14} color="#4285F4" />
                                    <Text style={styles.googleButtonText}>Google</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginTop: 8,
        marginHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 14,
    },
    rowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    badgeColumn: {
        width: 28,
        paddingTop: 1,
    },
    numberBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    numberText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#3B82F6',
    },
    textColumn: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 5,
    },
    placeName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E293B',
        flex: 1,
        marginRight: 8,
    },
    ratingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    ratingText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
        marginLeft: 3,
    },
    description: {
        fontSize: 13,
        color: '#64748B',
        lineHeight: 19,
        marginBottom: 10,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#16A34A',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        minHeight: 30,
    },
    saveButtonDone: {
        backgroundColor: '#6B7280',
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        minHeight: 30,
        borderWidth: 1,
        borderColor: '#4285F4',
        backgroundColor: '#FFFFFF',
    },
    buttonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
        marginLeft: 5,
    },
    googleButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4285F4',
        marginLeft: 5,
    },
});
