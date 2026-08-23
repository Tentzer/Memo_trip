import { type Memory } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import React from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Props {
    visible: boolean;
    onClose: () => void;
    shareRecipient: string;
    setShareRecipient: (value: string) => void;
    memoryToShare: Memory | null;
    onSubmit: (recipientInput: string, memory: Memory | null) => Promise<void>;
}

export default function ShareMemoryModal({
    visible,
    onClose,
    shareRecipient,
    setShareRecipient,
    memoryToShare,
    onSubmit,
}: Props) {
    const { theme } = useAppTheme();
    const handleSubmit = async () => {
        const recipientInput = shareRecipient;
        onClose();
        setShareRecipient('');
        await onSubmit(recipientInput, memoryToShare);
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable
                    style={styles.backdrop}
                    onPress={Keyboard.dismiss}
                    accessible={false}
                >
                    <View className="p-6 rounded-2xl w-80" style={{ backgroundColor: theme.colors.surface }}>
                        <Text className="text-lg font-bold" style={{ color: theme.colors.text }}>Share Memory</Text>
                        <TextInput
                            className="h-12 border rounded-xl px-4 font-medium mt-4"
                            style={{ borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.input }}
                            placeholder="Friend's username"
                            placeholderTextColor={theme.colors.placeholder}
                            value={shareRecipient}
                            onChangeText={setShareRecipient}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="default"
                            returnKeyType="send"
                        />
                        <TouchableOpacity
                            onPress={handleSubmit}
                            className="mt-6 p-4 bg-blue-600 rounded-xl items-center shadow-sm"
                        >
                            <Text className="text-white font-bold text-base">Share Memory</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onClose}
                            className="mt-4 p-3 rounded-xl items-center"
                            style={{ backgroundColor: theme.colors.surfaceMuted }}
                        >
                            <Text className="font-semibold" style={{ color: theme.colors.textSecondary }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
