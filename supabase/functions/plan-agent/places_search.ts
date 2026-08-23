import { cutoffDistanceFromApiRadius, filterAndRankNearMePlaces, readNearMeGeoEnv } from './geo.ts';
import { filterPlacesToAnchorLocality } from './locality_filter.ts';
import { nearMeDiagnostics, NEAR_ME_METRICS } from './near_me_metrics.ts';
import type { RecommendedPlace } from './plan_agent_types.ts';
import { logOsmPrototypeSample } from './osm_prototype.ts';

function mapGoogleResultToRecommended(r: Record<string, unknown>): RecommendedPlace | null {
    const geom = r.geometry as Record<string, unknown> | undefined;
    const loc = geom?.location as Record<string, number> | undefined;
    const lat = loc?.lat ?? 0;
    const lng = loc?.lng ?? 0;
    const placeId = r.place_id as string | undefined;
    const name = r.name as string | undefined;
    if (!placeId?.trim() || !name?.trim()) return null;
    const photos = r.photos as Record<string, unknown>[] | undefined;
    return {
        name,
        address: (r.formatted_address ?? r.vicinity ?? '') as string,
        rating: (r.rating ?? 0) as number,
        userRatingsTotal: (r.user_ratings_total ?? 0) as number,
        placeId,
        photoReference: (photos?.[0]?.photo_reference as string | undefined) ?? null,
        lat,
        lng,
        country: '',
        description: '',
    };
}

function dedupeByPlaceId(sorted: RecommendedPlace[]): RecommendedPlace[] {
    const seen = new Set<string>();
    const out: RecommendedPlace[] = [];
    for (const p of sorted) {
        if (seen.has(p.placeId)) continue;
        seen.add(p.placeId);
        out.push(p);
    }
    return out;
}

async function fetchNearByKeyword(
    query: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    googleKey: string,
): Promise<RecommendedPlace[]> {
    const keyword = query.trim().slice(0, 200);
    const params = new URLSearchParams({
        location: `${lat},${lng}`,
        radius: String(radiusMeters),
        keyword,
        key: googleKey,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`,
    );
    const data = await res.json();
    const raw = data.results;
    if (
        data.status !== 'OK' ||
        !Array.isArray(raw) ||
        raw.length === 0
    ) return [];

    const results: Record<string, unknown>[] = raw.slice(0, 20);
    const mapped = results.map(mapGoogleResultToRecommended).filter((x): x is RecommendedPlace =>
        x !== null
    );
    return mapped;
}

async function fetchTextSearch(
    query: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    googleKey: string,
): Promise<RecommendedPlace[]> {
    const params = new URLSearchParams({
        query,
        location: `${lat},${lng}`,
        radius: String(radiusMeters),
        key: googleKey,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
    );
    const data = await res.json();
    const raw = data.results;
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const results: Record<string, unknown>[] = raw.slice(0, 20);
    return results.map(mapGoogleResultToRecommended).filter((x): x is RecommendedPlace => x !== null);
}

/**
 * Nearby Search first for proximity intents; fallback to Text Search. Results ranked by distance.
 */
export async function searchNearbyPlaces(
    query: string,
    lat: number,
    lng: number,
    radiusMeters = 3000,
    excludePlaceIds?: Set<string>,
): Promise<RecommendedPlace[]> {
    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
    const geo = readNearMeGeoEnv();

    await logOsmPrototypeSample(lat, lng, Math.min(radiusMeters, 8000)).catch(() => {});

    const apiRadius = Math.min(50_000, radiusMeters);
    const keyword = query.trim();

    let pool: RecommendedPlace[] = [];

    const nearbyPlaces = keyword.length ? await fetchNearByKeyword(keyword, lat, lng, apiRadius, googleKey) : [];
    pool = [...nearbyPlaces];

    if (pool.length === 0) {
        pool = await fetchTextSearch(query, lat, lng, apiRadius, googleKey);
    }

    pool = dedupeByPlaceId(pool);

    if (excludePlaceIds?.size) {
        pool = pool.filter((p) => !excludePlaceIds.has(p.placeId));
    }

    const hardMax = cutoffDistanceFromApiRadius(apiRadius);

    let ranked = filterAndRankNearMePlaces(
        lat,
        lng,
        pool,
        hardMax,
        geo.minPreferredRating,
        Math.min(pool.length, 40),
        false,
    );

    if (ranked.length === 0 && pool.length > 0) {
        ranked = filterAndRankNearMePlaces(
            lat,
            lng,
            pool,
            hardMax,
            0,
            Math.min(pool.length, 40),
            false,
        );
    }

    if (Deno.env.get('PLAN_AGENT_LOG_NEAR_ME_DIAGNOSTICS') === 'true') {
        const d = nearMeDiagnostics(
            ranked.map((r) => r.distanceMeters),
            NEAR_ME_METRICS.reportRadiusMeters,
        );
        console.log('[plan-agent near_me]', JSON.stringify(d));
    }

    const capRaw = Deno.env.get('PLAN_AGENT_LOCALITY_CANDIDATE_CAP');
    const capParsed = capRaw ? Number.parseInt(capRaw.trim(), 10) : 18;
    const localityCap = Number.isFinite(capParsed) && capParsed >= 5 && capParsed <= 40
        ? capParsed
        : 18;

    const asPlaces: RecommendedPlace[] = ranked.slice(0, localityCap).map(
        ({ distanceMeters: _d, ...place }) => {
            void _d;
            return place;
        },
    );

    const localityFiltered = await filterPlacesToAnchorLocality(lat, lng, asPlaces, googleKey);

    return localityFiltered.slice(0, 5);
}

export async function searchPlaceAutocomplete(
    input: string,
    userLat: number,
    userLng: number,
): Promise<{ placeId: string; name: string } | null> {
    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
    const { autocompleteRadiusMeters } = readNearMeGeoEnv();
    const params = new URLSearchParams({
        input,
        location: `${userLat},${userLng}`,
        radius: String(autocompleteRadiusMeters),
        key: googleKey,
    });
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
    );
    const data = await res.json();
    if (!data.predictions?.length) return null;
    const first = data.predictions[0];
    return {
        placeId: first.place_id,
        name: first.structured_formatting?.main_text ?? first.description,
    };
}
