import { supabase } from '@/lib/supabase';
import type { PlanStop, RecommendationSection, RecommendedPlace } from '@/types/plan';
import type { PlanAgentHistoryItem } from '@/types/planAgentHistory';

export interface UserLocation {
    latitude: number;
    longitude: number;
}

export type AgentResponse =
    | { type: 'chat'; text: string }
    | { type: 'recommendations'; intro: string; places: RecommendedPlace[] }
    | { type: 'itinerary'; narrative: string; stops: PlanStop[] }
    | {
          type: 'plan_with_recommendations';
          narrative: string;
          sections: RecommendationSection[];
          stops: PlanStop[];
      }
    | { error: string };

export async function sendAgentMessage(
    message: string,
    userLocation: UserLocation,
    history?: PlanAgentHistoryItem[],
): Promise<AgentResponse> {
    const { data, error } = await supabase.functions.invoke<AgentResponse>('plan-agent', {
        body: { message, userLocation, history: history ?? [] },
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('No response from agent.');
    return data;
}
