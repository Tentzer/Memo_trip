import React from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Props {
    visible: boolean;
    isSaving: boolean;
    description: string;
    onChangeDescription: (value: string) => void;
    onClose: () => void;
    onSkip: () => void;
    onSaveWithDescription: () => void;
}

export default function PlaceDescriptionModal({
    visible,
    isSaving,
    description,
    onChangeDescription,
    onClose,
    onSkip,
    onSaveWithDescription,
}: Props) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/45 justify-center px-6">
                <View className="bg-white rounded-2xl p-5">
                    <Text className="text-slate-900 text-lg font-bold">No photo found</Text>
                    <Text className="text-slate-600 mt-2">
                        Add a short description so you can remember what this place is.
                    </Text>

                    <TextInput
                        value={description}
                        onChangeText={onChangeDescription}
                        placeholder="Example: Great pasta place near the fountain"
                        placeholderTextColor="#94a3b8"
                        multiline
                        editable={!isSaving}
                        className="mt-4 min-h-[96px] rounded-xl border border-slate-200 px-3 py-2 text-slate-800"
                    />

                    <View className="flex-row mt-4 gap-2">
                        <TouchableOpacity
                            onPress={onSkip}
                            disabled={isSaving}
                            className="flex-1 h-11 rounded-xl bg-slate-200 items-center justify-center"
                            style={{ opacity: isSaving ? 0.7 : 1 }}
                        >
                            <Text className="text-slate-700 font-semibold">Skip</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={onSaveWithDescription}
                            disabled={isSaving}
                            className="flex-1 h-11 rounded-xl bg-blue-600 items-center justify-center"
                            style={{ opacity: isSaving ? 0.7 : 1 }}
                        >
                            <Text className="text-white font-semibold">Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
