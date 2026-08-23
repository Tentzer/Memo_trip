export type StopCategory = 'food' | 'shopping' | 'attraction' | 'other';

export interface PlanStop {
    order: number;
    name: string;
    category: StopCategory;
    placeId: string;
    lat: number;
    lng: number;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    travelFromPreviousMinutes: number;
    photoReference: string | null;
    openingHours: string | null;
    country: string;
    warnings: string[];
}

export interface RecommendedPlace {
    name: string;
    address: string;
    rating: number;
    userRatingsTotal: number;
    placeId: string;
    photoReference: string | null;
    lat: number;
    lng: number;
    country: string;
    description: string;
}

export interface RecommendationSection {
    title: string;
    intro: string;
    places: RecommendedPlace[];
}

export interface PlanResponse {
    narrative: string;
    stops: PlanStop[];
}

export type ChatMessage =
    | { id: string; role: 'user'; text: string }
    | { id: string; role: 'agent'; type: 'text'; text: string }
    | { id: string; role: 'agent'; type: 'itinerary'; narrative: string; stops: PlanStop[] }
    | { id: string; role: 'agent'; type: 'recommendations'; intro: string; places: RecommendedPlace[] }
    | {
          id: string;
          role: 'agent';
          type: 'plan_with_recommendations';
          narrative: string;
          sections: RecommendationSection[];
          stops: PlanStop[];
      };
