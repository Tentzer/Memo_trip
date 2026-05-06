export type PlanAgentHistoryItem =
    | { role: 'user'; text: string }
    | { role: 'assistant'; text: string }
    | {
          role: 'assistant';
          kind: 'recommendations';
          intro: string;
          places: { name: string; placeId: string }[];
      }
    | {
          role: 'assistant';
          kind: 'itinerary';
          narrative: string;
          stops: { name: string; placeId: string }[];
      }
    | {
          role: 'assistant';
          kind: 'plan_with_recommendations';
          narrative: string;
          sections: { title: string; places: { name: string; placeId: string }[] }[];
          stops: { name: string; placeId: string }[];
      };
