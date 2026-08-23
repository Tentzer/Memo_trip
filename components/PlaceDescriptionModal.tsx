import { useAppTheme } from '@/context/ThemeContext';
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
    const { theme } = useAppTheme();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/45 justify-center px-6">
                <View className="rounded-2xl p-5" style={{ backgroundColor: theme.colors.surface }}>
                    <Text className="text-lg font-bold" style={{ color: theme.colors.text }}>No photo found</Text>
                    <Text className="mt-2" style={{ color: theme.colors.textSecondary }}>
                        Add a short description so you can remember what this place is.
                    </Text>

                    <TextInput
                        value={description}
                        onChangeText={onChangeDescription}
                        placeholder="Example: Great pasta place near the fountain"
                        placeholderTextColor={theme.colors.placeholder}
                        multiline
                        editable={!isSaving}
                        className="mt-4 min-h-[96px] rounded-xl border px-3 py-2"
                        style={{ borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.input }}
                    />

                    <View className="flex-row mt-4 gap-2">
                        <TouchableOpacity
                            onPress={onSkip}
                            disabled={isSaving}
                            className="flex-1 h-11 rounded-xl items-center justify-center"
                            style={{ backgroundColor: theme.colors.surfaceMuted, opacity: isSaving ? 0.7 : 1 }}
                        >
                            <Text className="font-semibold" style={{ color: theme.colors.textSecondary }}>Skip</Text>
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
