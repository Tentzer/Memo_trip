import { PlacePrediction } from '@/hooks/useMapLogic';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Matches `h-12` on the search row — keep in sync with Home menu placement below the bar. */
export const SEARCH_BAR_ROW_HEIGHT_PX = 48;

interface Props {
    showSearchBar: boolean;
    searchQuery: string;
    searchResults: PlacePrediction[];
    fetchPlaces: (text: string) => void;
    onClearSearch: () => void;
    handleSelectPlace: (placeId: string, description: string) => void;
}

export default function SearchBar({
    showSearchBar,
    searchQuery,
    searchResults,
    fetchPlaces,
    onClearSearch,
    handleSelectPlace,
}: Props) {
    const { theme } = useAppTheme();
    const insets = useSafeAreaInsets();
    /** Increase the added number to push the bar further down the screen. */
    const topOffset = insets.top + 16;
    const gutter = 20;

    return (
        <View
            className="absolute left-0 right-0 z-50"
            style={{
                top: topOffset,
                paddingLeft: gutter + insets.left,
                paddingRight: gutter + insets.right,
            }}
        >
            {showSearchBar && (
                <View
                    style={[
                        styles.searchRow,
                        {
                        backgroundColor: theme.colors.surfaceElevated,
                        shadowColor: theme.colors.shadow,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 10,
                        elevation: 2,
                        },
                    ]}
                >
                    <View className="absolute left-4 mt-2">
                        <Ionicons name="search" size={20} color={theme.colors.textMuted} />
                    </View>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text }]}
                        placeholder="Where to next, Traveler?"
                        placeholderTextColor={theme.colors.placeholder}
                        value={searchQuery}
                        onChangeText={fetchPlaces}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={onClearSearch}>
                            <Ionicons name="close-circle" size={20} color={theme.colors.borderStrong} />
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {searchResults.length > 0 && (
                <View style={[styles.results, { backgroundColor: theme.colors.surfaceElevated, shadowColor: theme.colors.shadow }]}>
                    {searchResults.map((item) => (
                        <TouchableOpacity
                            key={item.place_id}
                            style={[styles.resultRow, { borderBottomColor: theme.colors.border }]}
                            onPress={() => handleSelectPlace(item.place_id, item.description)}
                        >
                            <Text style={{ color: theme.colors.text }}>{item.description}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: SEARCH_BAR_ROW_HEIGHT_PX,
        borderRadius: 16,
        paddingHorizontal: 16,
    },
    input: {
        flex: 1,
        marginLeft: 40,
        fontWeight: '500',
    },
    results: {
        marginTop: 8,
        borderRadius: 16,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 4,
    },
    resultRow: {
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
});
