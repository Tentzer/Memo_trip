import type { ChatMessage } from '@/types/plan';
import type { PlanAgentHistoryItem } from '@/types/planAgentHistory';

const MAX_HISTORY_ITEMS = 24;

function assistantToHistoryItem(msg: Extract<ChatMessage, { role: 'agent' }>): PlanAgentHistoryItem {
    if (msg.type === 'text') {
        return { role: 'assistant', text: msg.text };
    }
    if (msg.type === 'recommendations') {
        return {
            role: 'assistant',
            kind: 'recommendations',
            intro: msg.intro,
            places: msg.places.map((p) => ({ name: p.name, placeId: p.placeId })),
        };
    }
    if (msg.type === 'itinerary') {
        return {
            role: 'assistant',
            kind: 'itinerary',
            narrative: msg.narrative,
            stops: msg.stops.map((s) => ({ name: s.name, placeId: s.placeId })),
        };
    }
    return {
        role: 'assistant',
        kind: 'plan_with_recommendations',
        narrative: msg.narrative,
        sections: msg.sections.map((sec) => ({
            title: sec.title,
            places: sec.places.map((p) => ({ name: p.name, placeId: p.placeId })),
        })),
        stops: msg.stops.map((s) => ({ name: s.name, placeId: s.placeId })),
    };
}

export function buildPlanAgentHistory(messages: ChatMessage[]): PlanAgentHistoryItem[] {
    const items: PlanAgentHistoryItem[] = [];
    for (const m of messages) {
        if (m.role === 'user') {
            items.push({ role: 'user', text: m.text });
        } else {
            items.push(assistantToHistoryItem(m));
        }
    }
    if (items.length <= MAX_HISTORY_ITEMS) return items;
    return items.slice(-MAX_HISTORY_ITEMS);
}
