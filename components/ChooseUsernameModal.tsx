import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import {
    claimUsername,
    isUsernameInputValid,
    suggestUsernameFromUser,
    USERNAME_INVALID_MESSAGE,
    USERNAME_MAX_LEN,
} from '@/lib/username';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface Props {
    visible: boolean;
    onComplete: (username: string) => void;
}

export default function ChooseUsernameModal({ visible, onComplete }: Props) {
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [usernameInput, setUsernameInput] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!visible || !user) return;
        setUsernameInput(suggestUsernameFromUser(user));
    }, [visible, user]);

    const canContinue = isUsernameInputValid(usernameInput);

    const handleSave = async () => {
        if (saving) return;
        if (!isUsernameInputValid(usernameInput)) {
            Alert.alert('Username', USERNAME_INVALID_MESSAGE);
            return;
        }
        setSaving(true);
        const result = await claimUsername(usernameInput);
        setSaving(false);

        if (!result.ok) {
            Alert.alert('Username', result.error);
            return;
        }
        onComplete(result.username);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={() => {}}
        >
            <SafeAreaView style={styles.safe}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.content}>
                        <Text style={styles.title}>Choose your username</Text>
                        <Text style={styles.subtitle}>
                            Friends use this to share memos and libraries with you.
                        </Text>

                        <Text style={styles.label}>Username</Text>
                        <TextInput
                            value={usernameInput}
                            onChangeText={setUsernameInput}
                            placeholder="yourusername"
                            placeholderTextColor={theme.colors.placeholder}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={USERNAME_MAX_LEN}
                            style={styles.input}
                        />
                        <Text style={styles.hint}>{USERNAME_INVALID_MESSAGE}</Text>

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={saving || !canContinue}
                            style={[styles.primaryBtn, (saving || !canContinue) && styles.primaryBtnDisabled]}
                        >
                            {saving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryBtnText}>Continue</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Modal>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => ({
    safe: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
    title: { fontSize: 28, fontWeight: '700' as const, color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 16, lineHeight: 22, color: colors.textMuted, marginBottom: 32 },
    label: { fontSize: 14, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: colors.text,
        backgroundColor: colors.input,
    },
    hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted, marginTop: 8, marginBottom: 28 },
    primaryBtn: {
        height: 55,
        borderRadius: 16,
        backgroundColor: '#2563eb',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    primaryBtnDisabled: { opacity: 0.45 },
    primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
});
