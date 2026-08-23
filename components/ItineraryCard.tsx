import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import type { PlanStop, StopCategory } from '@/types/plan';
import { useAppTheme } from '@/context/ThemeContext';

interface Props {
    stops: PlanStop[];
    onAddToMap: (stop: PlanStop) => Promise<void>;
}

const CATEGORY_ICON: Record<StopCategory, keyof typeof Ionicons.glyphMap> = {
    food: 'restaurant-outline',
    shopping: 'bag-handle-outline',
    attraction: 'camera-outline',
    other: 'location-outline',
};

export default function ItineraryCard({ stops, onAddToMap }: Props) {
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [addingId, setAddingId] = useState<string | null>(null);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

    const handleAdd = async (stop: PlanStop) => {
        if (addingId || savedIds.has(stop.placeId)) return;
        setAddingId(stop.placeId);
        try {
            await onAddToMap(stop);
            setSavedIds((prev) => new Set(prev).add(stop.placeId));
        } finally {
            setAddingId(null);
        }
    };

    return (
        <View style={styles.card}>
            {stops.map((stop, idx) => (
                <View key={stop.placeId} style={styles.stopRow}>
                    <View style={styles.timeline}>
                        <View style={styles.dot} />
                        {idx < stops.length - 1 && <View style={styles.line} />}
                    </View>

                    <View style={styles.stopContent}>
                        {stop.travelFromPreviousMinutes > 0 && (
                            <View style={styles.travelRow}>
                                <Ionicons name="car-outline" size={12} color={theme.colors.textMuted} />
                                <Text style={styles.travelText}>
                                    {stop.travelFromPreviousMinutes} min drive
                                </Text>
                            </View>
                        )}

                        <View style={styles.stopHeader}>
                            <Ionicons
                                name={CATEGORY_ICON[stop.category]}
                                size={16}
                                color="#3B82F6"
                                style={styles.categoryIcon}
                            />
                            <Text style={styles.stopName} numberOfLines={1}>
                                {stop.name}
                            </Text>
                        </View>

                        <Text style={styles.timeText}>
                            {stop.arrivalTime} — {stop.departureTime}
                        </Text>

                        {stop.openingHours ? (
                            <Text style={styles.hoursText} numberOfLines={1}>
                                {stop.openingHours}
                            </Text>
                        ) : null}

                        {stop.warnings.map((warning, i) => (
                            <View key={i} style={styles.warningRow}>
                                <Ionicons name="warning-outline" size={13} color="#F59E0B" />
                                <Text style={styles.warningText}>{warning}</Text>
                            </View>
                        ))}

                        <TouchableOpacity
                            style={[
                                styles.addButton,
                                savedIds.has(stop.placeId) && styles.addButtonSaved,
                            ]}
                            onPress={() => handleAdd(stop)}
                            disabled={!!addingId || savedIds.has(stop.placeId)}
                        >
                            {addingId === stop.placeId ? (
                                <ActivityIndicator size="small" color="#3B82F6" />
                            ) : savedIds.has(stop.placeId) ? (
                                <>
                                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                                    <Text style={styles.addButtonTextSaved}>Added to map</Text>
                                </>
                            ) : (
                                <>
                                    <Ionicons name="add-circle-outline" size={14} color="#3B82F6" />
                                    <Text style={styles.addButtonText}>Add to map</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </View>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 8,
        marginHorizontal: 16,
        paddingVertical: 12,
        paddingRight: 12,
        paddingLeft: 8,
    },
    stopRow: {
        flexDirection: 'row',
    },
    timeline: {
        width: 24,
        alignItems: 'center',
        paddingTop: 4,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3B82F6',
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: colors.accentSoft,
        marginTop: 4,
        marginBottom: -4,
    },
    stopContent: {
        flex: 1,
        paddingBottom: 16,
        paddingLeft: 8,
    },
    travelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
    },
    travelText: {
        fontSize: 12,
        color: colors.textMuted,
    },
    stopHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    categoryIcon: {
        marginRight: 6,
    },
    stopName: {
        fontSize: 15,
        fontWeight: '600',
        color: colors.text,
        flex: 1,
    },
    timeText: {
        fontSize: 13,
        color: colors.textSecondary,
        marginTop: 2,
    },
    hoursText: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    warningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    warningText: {
        fontSize: 12,
        color: '#F59E0B',
        flex: 1,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.accentSoft,
    },
    addButtonSaved: {
        borderColor: colors.success,
        backgroundColor: colors.successSoft,
    },
    addButtonText: {
        fontSize: 12,
        color: '#3B82F6',
        fontWeight: '500',
    },
    addButtonTextSaved: {
        fontSize: 12,
        color: '#22C55E',
        fontWeight: '500',
    },
});
