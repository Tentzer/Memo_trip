import type { RecommendedPlace } from './plan_agent_types.ts';

const COMPONENT_TYPES = [
    'locality',
    'postal_town',
    'administrative_area_level_3',
    'administrative_area_level_2',
] as const;

export interface LocalityProfile {
    /** Normalized country long name (or short if only short present). */
    countryKey: string | null;
    /** Normalized settlement names from Geocode address_components. */
    settlementKeys: Set<string>;
}

function normKey(s: string): string {
    return s
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function profileFromComponents(
    components: { types: string[]; long_name: string; short_name?: string }[] | undefined,
): LocalityProfile | null {
    if (!components?.length) return null;
    const settlementKeys = new Set<string>();
    let countryKey: string | null = null;

    for (const c of components) {
        if (c.types.includes('country')) {
            countryKey = normKey(c.long_name || c.short_name || '');
            if (countryKey.length === 0) countryKey = null;
        }
        for (const t of COMPONENT_TYPES) {
            if (c.types.includes(t)) {
                const k = normKey(c.long_name);
                if (k.length >= 2) settlementKeys.add(k);
            }
        }
    }

    if (settlementKeys.size === 0 && !countryKey) return null;
    return { countryKey, settlementKeys };
}

async function reverseGeocodeProfile(
    lat: number,
    lng: number,
    apiKey: string,
): Promise<LocalityProfile | null> {
    const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        key: apiKey,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await res.json();
    const components = data.results?.[0]?.address_components as
        | { types: string[]; long_name: string; short_name?: string }[]
        | undefined;
    return profileFromComponents(components);
}

/** Two profiles match if same country (when both known) and settlement names overlap or fuzzy-contain (long tokens). */
export function localitiesAlign(anchor: LocalityProfile, candidate: LocalityProfile): boolean {
    if (
        anchor.countryKey &&
        candidate.countryKey &&
        anchor.countryKey !== candidate.countryKey
    ) {
        return false;
    }

    const aKeys = [...anchor.settlementKeys];
    const bKeys = [...candidate.settlementKeys];
    if (aKeys.length === 0 || bKeys.length === 0) return false;

    for (const x of aKeys) {
        for (const y of bKeys) {
            if (x === y) return true;
            const shorter = x.length <= y.length ? x : y;
            const longer = x.length > y.length ? x : y;
            if (shorter.length >= 4 && longer.includes(shorter)) return true;
        }
    }
    return false;
}

type ProfileCache = Map<string, LocalityProfile | null>;

function cacheKey(lat: number, lng: number): string {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

async function getProfileCached(
    lat: number,
    lng: number,
    apiKey: string,
    cache: ProfileCache,
): Promise<LocalityProfile | null> {
    const key = cacheKey(lat, lng);
    if (cache.has(key)) return cache.get(key) ?? null;
    const p = await reverseGeocodeProfile(lat, lng, apiKey);
    cache.set(key, p);
    return p;
}

const BATCH = 5;

/**
 * Keeps places whose reverse-geocoded settlement aligns with the anchor (user or trip centroid).
 * Geocode results are cached per coordinate within this call. If anchor has no settlement keys, returns `places` unchanged.
 */
export async function filterPlacesToAnchorLocality(
    anchorLat: number,
    anchorLng: number,
    places: RecommendedPlace[],
    apiKey: string,
): Promise<RecommendedPlace[]> {
    if (Deno.env.get('PLAN_AGENT_LOCALITY_FILTER') === 'false') {
        return places;
    }

    const cache: ProfileCache = new Map();

    const anchorProfile = await getProfileCached(anchorLat, anchorLng, apiKey, cache);
    if (
        !anchorProfile ||
        anchorProfile.settlementKeys.size === 0
    ) {
        return places;
    }

    const kept: RecommendedPlace[] = [];

    for (let i = 0; i < places.length; i += BATCH) {
        const chunk = places.slice(i, i + BATCH);
        const profiles = await Promise.all(
            chunk.map((p) => getProfileCached(p.lat, p.lng, apiKey, cache)),
        );
        for (let j = 0; j < chunk.length; j++) {
            const p = chunk[j]!;
            const prof = profiles[j];
            if (prof && localitiesAlign(anchorProfile, prof)) {
                kept.push(p);
            }
        }
    }

    if (kept.length > 0) {
        return kept;
    }

    if (Deno.env.get('PLAN_AGENT_LOCALITY_STRICT') === 'true') {
        return [];
    }

    return places;
}
