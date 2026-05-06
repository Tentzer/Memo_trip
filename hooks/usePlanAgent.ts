import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { buildPlanAgentHistory } from '@/lib/planAgentHistory';
import { sendAgentMessage } from '@/lib/planApi';
import type { ChatMessage } from '@/types/plan';

export function usePlanAgent() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const idRef = useRef(0);

    const nextId = () => `msg-${++idRef.current}`;

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        const history = buildPlanAgentHistory(messages);
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed }]);
        setLoading(true);

        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                throw new Error('Location permission is required.');
            }

            const loc = await Location.getCurrentPositionAsync({});
            const response = await sendAgentMessage(
                trimmed,
                {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                },
                history,
            );

            if ('error' in response) {
                setMessages((prev) => [
                    ...prev,
                    { id: nextId(), role: 'agent', type: 'text', text: response.error },
                ]);
                return;
            }

            if (response.type === 'chat') {
                setMessages((prev) => [
                    ...prev,
                    { id: nextId(), role: 'agent', type: 'text', text: response.text },
                ]);
            } else if (response.type === 'recommendations') {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: nextId(),
                        role: 'agent',
                        type: 'recommendations',
                        intro: response.intro,
                        places: response.places,
                    },
                ]);
            } else if (response.type === 'itinerary') {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: nextId(),
                        role: 'agent',
                        type: 'itinerary',
                        narrative: response.narrative,
                        stops: response.stops,
                    },
                ]);
            } else if (response.type === 'plan_with_recommendations') {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: nextId(),
                        role: 'agent',
                        type: 'plan_with_recommendations',
                        narrative: response.narrative,
                        sections: response.sections,
                        stops: response.stops,
                    },
                ]);
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setMessages((prev) => [
                ...prev,
                { id: nextId(), role: 'agent', type: 'text', text: message },
            ]);
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, messages]);

    const clearMessages = useCallback(() => setMessages([]), []);

    return { messages, loading, sendMessage, clearMessages };
}
