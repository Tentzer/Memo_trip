import { type Memory } from '@/context/MemoryContext';
import React from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface Props {
    visible: boolean;
    onClose: () => void;
    shareEmail: string;
    setShareEmail: (email: string) => void;
    memoryToShare: Memory | null;
    onSubmit: (email: string, memory: Memory | null) => Promise<void>;
}

export default function ShareMemoryModal({
    visible,
    onClose,
    shareEmail,
    setShareEmail,
    memoryToShare,
    onSubmit,
}: Props) {
    const handleSubmit = async () => {
        const emailToSend = shareEmail;
        onClose();
        setShareEmail('');
        await onSubmit(emailToSend, memoryToShare);
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
                    <View className="bg-white p-6 rounded-2xl w-80">
                        <Text className="text-lg font-bold">Share Memory</Text>
                        <TextInput
                            className="h-12 border border-gray-200 rounded-xl px-4 text-slate-800 font-medium mt-4"
                            placeholder="User's Email"
                            placeholderTextColor="#94a3b8"
                            value={shareEmail}
                            onChangeText={setShareEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
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
                            className="mt-4 p-3 bg-gray-100 rounded-xl items-center"
                        >
                            <Text className="text-gray-600 font-semibold">Cancel</Text>
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
