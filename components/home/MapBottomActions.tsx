import type { MapLibraryFilter } from '@/lib/mapMemoryPins';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MapBottomActionsProps = {
    tabBarHeight: number;
    activeMapLibraryFilter: MapLibraryFilter | null;
    onClearFilter: () => void;
    userChoseAddress: boolean;
    showRoute: boolean;
    isPlaceAlreadySaved: boolean;
    isAddingPlace: boolean;
    routeDistance: string;
    mapMoved: boolean;
    onRoutePress: () => void;
    onAddMemo: () => void;
    onStopRoute: () => void;
    onRecenter: () => void;
};

export default function MapBottomActions({
    tabBarHeight,
    activeMapLibraryFilter,
    onClearFilter,
    userChoseAddress,
    showRoute,
    isPlaceAlreadySaved,
    isAddingPlace,
    routeDistance,
    mapMoved,
    onRoutePress,
    onAddMemo,
    onStopRoute,
    onRecenter,
}: MapBottomActionsProps) {
    const { theme } = useAppTheme();

    return (
        <>
            <View style={{ position: 'absolute', bottom: 30 + tabBarHeight, left: 30, zIndex: 100 }}>
                {activeMapLibraryFilter && (
                    <View style={{ marginBottom: 8 }}>
                        <TouchableOpacity
                            onPress={onClearFilter}
                            className="h-[38px] px-3 bg-slate-700 rounded-2xl items-center justify-center"
                        >
                            <Text className="text-white font-bold">Show all memos</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {userChoseAddress && !showRoute && !isPlaceAlreadySaved && (
                    <View className="flex-row gap-x-2">
                        <TouchableOpacity
                            onPress={onRoutePress}
                            className="h-[36px] min-w-[88px] px-3 bg-blue-600 rounded-xl items-center justify-center shadow-lg"
                        >
                            <Text className="text-white font-semibold text-[15px]">Route</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onAddMemo}
                            disabled={isAddingPlace}
                            className="h-[36px] min-w-[104px] px-3.5 bg-green-500 rounded-xl items-center justify-center shadow-lg"
                            style={{ opacity: isAddingPlace ? 0.7 : 1 }}
                        >
                            {isAddingPlace ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <Text className="text-white font-semibold text-[15px]">Add Memo</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {showRoute && (
                    <TouchableOpacity
                        onPress={onStopRoute}
                        className="h-[40px] w-[100px] bg-red-500 rounded-2xl items-center justify-center shadow-lg"
                    >
                        <Text className="text-white font-bold text-lg">Stop</Text>
                    </TouchableOpacity>
                )}
            </View>

            {routeDistance ? (
                <View style={{ position: 'absolute', bottom: 80 + tabBarHeight, left: 30, zIndex: 100 }}>
                    <View style={[styles.routeDistancePill, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <Text style={[styles.routeDistanceText, { color: theme.colors.textSecondary }]}>🚶 {routeDistance} walk</Text>
                    </View>
                </View>
            ) : null}

            {mapMoved && (
                <TouchableOpacity
                    onPress={onRecenter}
                    style={[styles.recenterButton, { bottom: 50 + tabBarHeight, backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }]}
                >
                    <Ionicons name="locate" size={24} color={theme.colors.accentText} />
                </TouchableOpacity>
            )}
        </>
    );
}

const styles = StyleSheet.create({
    routeDistancePill: {
        height: 45,
        width: 150,
        padding: 12,
        borderRadius: 24,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeDistanceText: {
        fontWeight: '700',
    },
    recenterButton: {
        position: 'absolute',
        right: 20,
        zIndex: 100,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(37, 99, 235, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(147, 197, 253, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1d4ed8',
        shadowOpacity: 0.26,
        shadowRadius: 10,
        elevation: 6,
    },
});
