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
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatMessage from '@/components/ChatMessage';
import { useMemories } from '@/context/MemoryContext';
import { usePlanAgent } from '@/hooks/usePlanAgent';
import type { ChatMessage as ChatMessageType, PlanStop, RecommendedPlace } from '@/types/plan';

const PLACEHOLDER_URL = 'https://placehold.co/400x400/e2e8f0/94a3b8.png?text=?';

export default function PlanScreen() {
    const [inputText, setInputText] = useState('');
    const { messages, loading, sendMessage, clearMessages } = usePlanAgent();
    const { addPlaceMemory } = useMemories();
    const listRef = useRef<FlatList<ChatMessageType>>(null);
    const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text || loading) return;
        setInputText('');
        await sendMessage(text);
    };

    const handleAddStopToMap = async (stop: PlanStop): Promise<void> => {
        const photoUri = stop.photoReference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${stop.photoReference}&key=${GOOGLE_API_KEY}`
            : PLACEHOLDER_URL;
        await addPlaceMemory(photoUri, stop.lat, stop.lng, stop.country, stop.name);
    };

    const handleSaveToMemories = async (place: RecommendedPlace): Promise<void> => {
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

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={90}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="sparkles-outline" size={52} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>Your travel assistant</Text>
                        <Text style={styles.emptySubtitle}>
                            Ask me to find places nearby, plan your day, or just say hello.
                        </Text>
                        <View style={styles.examplesContainer}>
                            <View style={styles.exampleChip}>
                                <Text style={styles.exampleChipText}>"Where can I get good ice cream?"</Text>
                            </View>
                            <View style={styles.exampleChip}>
                                <Text style={styles.exampleChipText}>"Plan my day: breakfast, Zara, dinner"</Text>
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
                                    <ActivityIndicator size="small" color="#94A3B8" />
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
                            <Ionicons name="trash-outline" size={18} color="#94A3B8" />
                        </TouchableOpacity>
                    )}
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Ask me anything..."
                        placeholderTextColor="#94A3B8"
                        multiline
                        maxLength={500}
                        editable={!loading}
                        onSubmitEditing={handleSend}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!inputText.trim() || loading) && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Ionicons name="send" size={18} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
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
        color: '#1E293B',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 21,
    },
    examplesContainer: {
        marginTop: 8,
        width: '100%',
        gap: 8,
    },
    exampleChip: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    exampleChipText: {
        fontSize: 14,
        color: '#64748B',
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
        color: '#94A3B8',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        gap: 8,
        backgroundColor: '#FFFFFF',
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
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        color: '#1E293B',
        backgroundColor: '#F8FAFC',
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
        backgroundColor: '#CBD5E1',
    },
});
