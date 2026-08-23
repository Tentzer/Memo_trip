import type { RecommendedPlace } from './plan_agent_types.ts';

const EARTH_RADIUS_METERS = 6_371_000;

/** Haversine distance between two WGS84 points. */
export function haversineDistanceMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    return EARTH_RADIUS_METERS * c;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw?.trim()) return fallback;
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseRating(raw: string | undefined, fallback: number): number {
    if (!raw?.trim()) return fallback;
    const x = Number.parseFloat(raw.trim());
    return Number.isFinite(x) && x >= 0 && x <= 5 ? x : fallback;
}

export interface NearMeGeoEnv {
    /** Added to Places API bias radius when dropping candidates beyond distance. */
    slackMeters: number;
    /** Default radius for biased place search near user device (Nearby / Text bias). Cap 50000. */
    textSearchBiasRadiusMeters: number;
    /** Google Places Autocomplete radius meters (cap 50000). */
    autocompleteRadiusMeters: number;
    /** Prefer rated pool >= this before distance sorting (when pool non-empty). */
    minPreferredRating: number;
}

export function readNearMeGeoEnv(): NearMeGeoEnv {
    return {
        slackMeters: parsePositiveInt(Deno.env.get('PLAN_AGENT_DISTANCE_SLACK_METERS'), 200),
        textSearchBiasRadiusMeters: Math.min(
            50_000,
            parsePositiveInt(Deno.env.get('PLAN_AGENT_TEXT_SEARCH_RADIUS_METERS'), 3000),
        ),
        autocompleteRadiusMeters: Math.min(
            50_000,
            parsePositiveInt(Deno.env.get('PLAN_AGENT_AUTOCOMPLETE_RADIUS_METERS'), 12_000),
        ),
        minPreferredRating: parseRating(Deno.env.get('PLAN_AGENT_MIN_PREFERRED_RATING'), 3.5),
    };
}

export function cutoffDistanceFromApiRadius(apiRadiusMeters: number): number {
    const { slackMeters } = readNearMeGeoEnv();
    return apiRadiusMeters + slackMeters;
}

export type RankedPlace = RecommendedPlace & { distanceMeters: number };

/**
 * Remove places outside hardMaxMeters, then rank by proximity first (then rating).
 * Legacy behavior (rating-first) retained for regression tests via `sortByRatingFirst`.
 */
export function filterAndRankNearMePlaces(
    originLat: number,
    originLng: number,
    mapped: RecommendedPlace[],
    hardMaxMeters: number,
    minPreferredRating: number,
    limit: number,
    sortByRatingFirst = false,
): RankedPlace[] {
    const withDist = mapped
        .map((p) => ({
            ...p,
            distanceMeters: haversineDistanceMeters(originLat, originLng, p.lat, p.lng),
        }))
        .filter((p) => p.distanceMeters <= hardMaxMeters);

    const preferred = withDist.filter((p) => p.rating >= minPreferredRating);
    const pool = preferred.length > 0 ? preferred : withDist;

    const sorted = [...pool].sort((a, b) => {
        if (sortByRatingFirst) {
            if (b.rating !== a.rating) return b.rating - a.rating;
            return a.distanceMeters - b.distanceMeters;
        }
        if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
        return b.rating - a.rating;
    });

    return sorted.slice(0, limit);
}
