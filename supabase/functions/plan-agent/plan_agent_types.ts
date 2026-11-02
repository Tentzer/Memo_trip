/** Mirrors app-side RecommendedPlace ([types/plan.ts]) — keep fields aligned manually. */

export interface RecommendedPlace {
    name: string;
    address: string;
    rating: number;
    userRatingsTotal: number;
    placeId: string;
    photoReference: string | null;
    photoReferences?: string[];
    lat: number;
    lng: number;
    country: string;
    description: string;
}
