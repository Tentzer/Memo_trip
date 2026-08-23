import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import ChatMessage from '@/components/ChatMessage';
import { useAuth } from '@/context/AuthContext';
import { useMemories } from '@/context/MemoryContext';
import { useAppTheme } from '@/context/ThemeContext';
import { usePlanAgent } from '@/hooks/usePlanAgent';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import type { ChatMessage as ChatMessageType, PlanStop, RecommendedPlace } from '@/types/plan';

const PLACEHOLDER_URL = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

export default function PlanScreen() {
    const { user } = useAuth();
    const { theme } = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
    const [inputText, setInputText] = useState('');
    const { messages, loading, sendMessage, clearMessages } = usePlanAgent();
    const { addPlaceMemory } = useMemories();
    const listRef = useRef<FlatList<ChatMessageType>>(null);
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    const ensureSignedIn = (message: string): boolean => {
        if (user?.id) return true;
        alertRequireSignIn(message);
        return false;
    };

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || loading) return;
        if (!ensureSignedIn('Sign in to chat with Plan and save places to your memories.')) return;
        setInputText('');
        await sendMessage(text);
    };

    const handleAddStopToMap = async (stop: PlanStop): Promise<void> => {
        if (!ensureSignedIn('Sign in to save this stop to your memos.')) return;
        const photoUri = stop.photoReference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${stop.photoReference}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_URL;
        await addPlaceMemory(photoUri, stop.lat, stop.lng, stop.country, stop.name);
    };

    const handleSaveToMemories = async (place: RecommendedPlace): Promise<void> => {
        if (!ensureSignedIn('Sign in to save this place to your memos.')) return;
        const photoUri = place.photoReference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${place.photoReference}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_URL;
        await addPlaceMemory(
            photoUri,
            place.lat,
            place.lng,
            place.country,
            place.description || undefined,
            place.name,
        );
    };

    const sendDisabled = !inputText.trim() || loading;

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={90}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="sparkles-outline" size={52} color={theme.colors.borderStrong} />
                        <Text style={styles.emptyTitle}>Your travel assistant</Text>
                        <Text style={styles.emptySubtitle}>
                            Ask me to find places nearby, plan your day, or just say hello.
                        </Text>
                        <View style={styles.examplesContainer}>
                            <View style={styles.exampleChip}>
                                <Text style={styles.exampleChipText}>{'"Where can I get good ice cream?"'}</Text>
                            </View>
                            <View style={styles.exampleChip}>
                                <Text style={styles.exampleChipText}>{'"Plan my day: breakfast, Zara, dinner"'}</Text>
                            </View>
                        </View>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <ChatMessage
                                message={item}
                                onAddStopToMap={handleAddStopToMap}
                                onSaveToMemories={handleSaveToMemories}
                            />
                        )}
                        contentContainerStyle={styles.listContent}
                        onContentSizeChange={() =>
                            listRef.current?.scrollToEnd({ animated: true })
                        }
                        ListFooterComponent={
                            loading ? (
                                <View style={styles.typingIndicator}>
                                    <ActivityIndicator size="small" color={theme.colors.textMuted} />
                                    <Text style={styles.typingText}>Thinking...</Text>
                                </View>
                            ) : null
                        }
                    />
                )}

                <View style={styles.inputBar}>
                    {messages.length > 0 && (
                        <TouchableOpacity
                            style={styles.clearButton}
                            onPress={clearMessages}
                            disabled={loading}
                        >
                            <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                    )}
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder={user?.id ? 'Ask me anything...' : 'Type a question, then sign in to send...'}
                        placeholderTextColor={theme.colors.placeholder}
                        multiline
                        maxLength={500}
                        editable={!loading}
                        onSubmitEditing={handleSend}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            sendDisabled && styles.sendButtonDisabled,
                        ]}
                        onPress={() => void handleSend()}
                        disabled={sendDisabled}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Ionicons name="send" size={18} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

type ThemeColors = ReturnType<typeof useAppTheme>['theme']['colors'];

const createStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    flex: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
    },
    emptySubtitle: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 21,
    },
    examplesContainer: {
        marginTop: 8,
        width: '100%',
        gap: 8,
    },
    exampleChip: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    exampleChipText: {
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 20,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    listContent: {
        paddingTop: 16,
        paddingBottom: 8,
    },
    typingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    typingText: {
        fontSize: 13,
        color: colors.textMuted,
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 8,
        backgroundColor: colors.surface,
    },
    clearButton: {
        width: 36,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        color: colors.text,
        backgroundColor: colors.input,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: colors.disabled,
    },
});
