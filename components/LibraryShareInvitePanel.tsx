import { useAppTheme } from '@/context/ThemeContext';
import React from 'react';
import { StyleProp, Text, TextInput, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';

type Props = {
    title: string;
    recipient: string;
    onChangeRecipient: (value: string) => void;
    onSend: () => void;
    onCancel: () => void;
    styles: {
        panelCard: StyleProp<ViewStyle>;
        panelInlineTitle: StyleProp<TextStyle>;
        recipientInput: StyleProp<TextStyle>;
        sendButton: StyleProp<ViewStyle>;
        cancelButton: StyleProp<ViewStyle>;
        cancelButtonText: StyleProp<TextStyle>;
    };
};

/** Username input used to invite someone to a custom library or to a country folder. */
export default function LibraryShareInvitePanel({
    title,
    recipient,
    onChangeRecipient,
    onSend,
    onCancel,
    styles,
}: Props) {
    const { theme } = useAppTheme();

    return (
        <View style={styles.panelCard}>
            <Text style={styles.panelInlineTitle}>{title}</Text>
            <TextInput
                value={recipient}
                onChangeText={onChangeRecipient}
                placeholder="Friend's username"
                placeholderTextColor={theme.colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                style={styles.recipientInput}
                returnKeyType="send"
                onSubmitEditing={onSend}
            />
            <View className="flex-row mt-3.5" style={{ gap: 10 }}>
                <TouchableOpacity onPress={onSend} style={styles.sendButton}>
                    <Text className="text-white font-bold">Send Invite</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
