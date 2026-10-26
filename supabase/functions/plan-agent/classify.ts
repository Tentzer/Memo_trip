export type IntentType = 'chat' | 'recommend' | 'plan' | 'plan_with_recommendations';

export interface ClassifiedIntent {
    intent: IntentType;
    chatResponse: string | null;
    searchQuery: string | null;
    exclude_prior_place_results?: boolean;
}

export const CLASSIFY_FALLBACK_MESSAGE =
    "I couldn't read that. Try asking about a place, a city, or a plan for the day.";

const INTENTS: readonly IntentType[] = [
    'chat',
    'recommend',
    'plan',
    'plan_with_recommendations',
];

export function classifyFallback(): ClassifiedIntent {
    return {
        intent: 'chat',
        chatResponse: CLASSIFY_FALLBACK_MESSAGE,
        searchQuery: null,
        exclude_prior_place_results: false,
    };
}

function isIntent(value: unknown): value is IntentType {
    return typeof value === 'string' && INTENTS.includes(value as IntentType);
}

function extractJsonObject(raw: string): unknown {
    const withoutBom = raw.replace(/^\uFEFF/, '').trim();
    const fence = withoutBom.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = (fence?.[1] ?? withoutBom).trim();
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) {
        throw new SyntaxError('no json object');
    }
    return JSON.parse(body.slice(start, end + 1));
}

export function parseClassifiedIntent(raw: string): { intent: ClassifiedIntent; fallback: boolean } {
    try {
        const parsed = extractJsonObject(raw);
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { intent: classifyFallback(), fallback: true };
        }
        const record = parsed as Record<string, unknown>;
        if (!isIntent(record.intent)) {
            return { intent: classifyFallback(), fallback: true };
        }
        return {
            fallback: false,
            intent: {
                intent: record.intent,
                chatResponse: typeof record.chatResponse === 'string' ? record.chatResponse : null,
                searchQuery: typeof record.searchQuery === 'string' ? record.searchQuery : null,
                exclude_prior_place_results: record.exclude_prior_place_results === true,
            },
        };
    } catch {
        return { intent: classifyFallback(), fallback: true };
    }
}
