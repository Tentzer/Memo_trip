import { PlacePrediction } from '@/hooks/useMapLogic';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

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
    return (
        <View className="absolute top-5 px-5 left-0 right-0 z-50">
            {showSearchBar && (
                <View
                    className="flex-row items-center bg-white h-12 rounded-2xl px-4 shadow-lg"
                    style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 10,
                        elevation: 2,
                    }}
                >
                    <View className="absolute left-4 mt-2">
                        <Ionicons name="search" size={20} color="#64748b" />
                    </View>
                    <TextInput
                        className="flex-1 text-align text-slate-800 font-medium ml-10"
                        placeholder="Where to next, Traveler?"
                        placeholderTextColor="#94a3b8"
                        value={searchQuery}
                        onChangeText={fetchPlaces}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={onClearSearch}>
                            <Ionicons name="close-circle" size={20} color="#cbd5e1" />
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {searchResults.length > 0 && (
                <View className="bg-white mt-2 rounded-2xl shadow-xl overflow-hidden">
                    {searchResults.map((item) => (
                        <TouchableOpacity
                            key={item.place_id}
                            className="p-4 border-b border-slate-100 active:bg-slate-50"
                            onPress={() => handleSelectPlace(item.place_id, item.description)}
                        >
                            <Text className="text-slate-800">{item.description}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}
