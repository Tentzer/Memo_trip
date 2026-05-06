import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatMessage as ChatMessageType, PlanStop, RecommendedPlace } from '@/types/plan';
import ItineraryCard from './ItineraryCard';
import RecommendationsCard from './RecommendationsCard';

interface Props {
    message: ChatMessageType;
    onAddStopToMap: (stop: PlanStop) => Promise<void>;
    onSaveToMemories: (place: RecommendedPlace) => Promise<void>;
}

export default function ChatMessage({ message, onAddStopToMap, onSaveToMemories }: Props) {
    if (message.role === 'user') {
        return (
            <View style={styles.userWrapper}>
                <View style={styles.userBubble}>
                    <Text style={styles.userText}>{message.text}</Text>
                </View>
            </View>
        );
    }

    if (message.type === 'itinerary') {
        return (
            <View style={styles.agentWrapper}>
                <View style={styles.agentBubble}>
                    <Text style={styles.agentText}>{message.narrative}</Text>
                </View>
                <ItineraryCard stops={message.stops} onAddToMap={onAddStopToMap} />
            </View>
        );
    }

    if (message.type === 'plan_with_recommendations') {
        return (
            <View style={styles.agentWrapper}>
                <View style={styles.agentBubble}>
                    <Text style={styles.agentText}>{message.narrative}</Text>
                </View>
                {message.sections.map((section, idx) => (
                    <View key={`${section.title}-${idx}`}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <View style={styles.agentBubble}>
                            <Text style={styles.agentText}>{section.intro}</Text>
                        </View>
                        <RecommendationsCard
                            places={section.places}
                            onSaveToMemories={onSaveToMemories}
                        />
                    </View>
                ))}
                <View style={styles.itineraryBlock}>
                    <ItineraryCard stops={message.stops} onAddToMap={onAddStopToMap} />
                </View>
            </View>
        );
    }

    if (message.type === 'recommendations') {
        return (
            <View style={styles.agentWrapper}>
                <View style={styles.agentBubble}>
                    <Text style={styles.agentText}>{message.intro}</Text>
                </View>
                <RecommendationsCard places={message.places} onSaveToMemories={onSaveToMemories} />
            </View>
        );
    }

    return (
        <View style={styles.agentWrapper}>
            <View style={styles.agentBubble}>
                <Text style={styles.agentText}>{message.text}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    userWrapper: {
        marginVertical: 4,
        paddingHorizontal: 16,
    },
    agentWrapper: {
        marginVertical: 4,
    },
    userBubble: {
        backgroundColor: '#3B82F6',
        borderRadius: 18,
        borderBottomRightRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: '80%',
        alignSelf: 'flex-end',
    },
    agentBubble: {
        backgroundColor: '#F1F5F9',
        borderRadius: 18,
        borderBottomLeftRadius: 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        maxWidth: '90%',
        marginHorizontal: 16,
        alignSelf: 'flex-start',
    },
    userText: {
        color: '#FFFFFF',
        fontSize: 15,
        lineHeight: 22,
    },
    agentText: {
        color: '#1E293B',
        fontSize: 15,
        lineHeight: 22,
    },
    sectionTitle: {
        marginTop: 12,
        marginBottom: 6,
        marginHorizontal: 16,
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
    },
    itineraryBlock: {
        marginTop: 8,
    },
});
