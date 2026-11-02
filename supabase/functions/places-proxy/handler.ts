import {
    bravePlaceSearchUrl,
    mapBraveSearchResponse,
    predictionFromBravePlace,
    type MappedBravePlace,
} from '../../../lib/places/bravePlace.ts';
import type { AuthResult } from '../_shared/auth.ts';
import { CORS_HEADERS, jsonResponse } from '../_shared/http.ts';
import {
    dailyLimitMessage,
    DEFAULT_PLACES_PROXY_DAILY_LIMIT,
    enforceDailyLimit,
    PLACES_PROXY_ENDPOINT,
    readDailyLimit,
    type RateLimitIncrement,
} from '../_shared/rate_limit.ts';

export type PlacesOp = 'search' | 'nearby' | 'details' | 'photos';

export interface PlacesProxyBody {
    op?: string;
    query?: string;
    title?: string;
    address?: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
}

export interface PlacesProxyDeps {
    authenticate: (req: Request) => Promise<AuthResult>;
    increment: RateLimitIncrement;
    apiKey: () => string | undefined;
    dailyLimit: () => string | undefined;
    fetchImpl?: typeof fetch;
    photoCache: Map<string, string[]>;
    now?: () => Date;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isOp(value: string | undefined): value is PlacesOp {
    return value === 'search' || value === 'nearby' || value === 'details' || value === 'photos';
}

function rememberPhotos(cache: Map<string, string[]>, places: MappedBravePlace[]) {
    for (const place of places) {
        if (place.photoUrls.length) cache.set(place.placeId, place.photoUrls);
    }
}

function pickPlace(places: MappedBravePlace[], body: PlacesProxyBody): MappedBravePlace | null {
    if (!places.length) return null;
    const placeId = body.placeId?.trim();
    if (placeId) {
        const match = places.find((place) => place.placeId === placeId);
        if (match) return match;
    }
    const latitude = finiteNumber(body.latitude);
    const longitude = finiteNumber(body.longitude);
    if (latitude != null && longitude != null) {
        return [...places].sort((a, b) => {
            const aScore = (a.latitude - latitude) ** 2 + (a.longitude - longitude) ** 2;
            const bScore = (b.latitude - latitude) ** 2 + (b.longitude - longitude) ** 2;
            return aScore - bScore;
        })[0] ?? null;
    }
    return places[0] ?? null;
}

async function loadPlaces(
    body: PlacesProxyBody,
    apiKey: string,
    deps: PlacesProxyDeps,
): Promise<MappedBravePlace[]> {
    const url = bravePlaceSearchUrl({
        query: body.query?.trim() || body.title?.trim() || '',
        latitude: finiteNumber(body.latitude),
        longitude: finiteNumber(body.longitude),
        radiusMeters: finiteNumber(body.radiusMeters),
    });
    const response = await (deps.fetchImpl ?? fetch)(url, {
        headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
        },
    });
    if (!response.ok) {
        throw new Error(`Brave place search failed (${response.status})`);
    }
    const places = mapBraveSearchResponse(await response.json());
    rememberPhotos(deps.photoCache, places);
    return places;
}

function placePayload(place: MappedBravePlace) {
    return {
        latitude: place.latitude,
        longitude: place.longitude,
        photoReference: null,
        country: null,
        title: place.name,
        address: place.address,
        category: place.category,
        rating: place.rating,
        reviewCount: place.reviewCount,
        phone: place.phone,
        website: place.website,
        hours: place.hours,
        placeId: place.placeId,
    };
}

export async function handlePlacesProxy(req: Request, deps: PlacesProxyDeps): Promise<Response> {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    const auth = await deps.authenticate(req);
    if (auth instanceof Response) return auth;

    let body: PlacesProxyBody;
    try {
        body = await req.json() as PlacesProxyBody;
    } catch {
        return jsonResponse({ error: 'Invalid request.' }, 400);
    }
    if (!isOp(body.op)) {
        return jsonResponse({ error: 'Unknown place request.' }, 400);
    }
    if (body.op === 'search' && !body.query?.trim()) {
        return jsonResponse({ error: 'query is required.' }, 400);
    }
    if (body.op === 'nearby' && (finiteNumber(body.latitude) == null || finiteNumber(body.longitude) == null)) {
        return jsonResponse({ error: 'latitude and longitude are required.' }, 400);
    }
    if ((body.op === 'details' || body.op === 'photos') && !body.placeId?.trim() && !body.query?.trim() && !body.title?.trim()) {
        return jsonResponse({ error: 'placeId or title is required.' }, 400);
    }

    const limit = readDailyLimit(deps.dailyLimit(), DEFAULT_PLACES_PROXY_DAILY_LIMIT);
    const limited = await enforceDailyLimit(deps.increment, {
        userId: auth.userId,
        endpoint: PLACES_PROXY_ENDPOINT,
        limit,
        now: deps.now?.(),
        message: dailyLimitMessage(limit, 'place searches'),
    });
    if (limited) return limited;

    const apiKey = deps.apiKey()?.trim() ?? '';
    if (!apiKey) {
        console.error('places-proxy missing BRAVE_SEARCH_API_KEY');
        return jsonResponse({ error: 'Place search is not configured.' }, 500);
    }

    try {
        if (body.op === 'photos' && body.placeId && deps.photoCache.has(body.placeId)) {
            return jsonResponse({ photos: deps.photoCache.get(body.placeId) ?? [] });
        }

        const places = await loadPlaces(body, apiKey, deps);
        if (body.op === 'details') {
            const place = pickPlace(places, body);
            return jsonResponse({ place: place ? placePayload(place) : null });
        }
        if (body.op === 'photos') {
            const place = pickPlace(places, body);
            return jsonResponse({ photos: place?.photoUrls ?? [] });
        }
        return jsonResponse({ predictions: places.map(predictionFromBravePlace) });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('places-proxy failed:', detail);
        return jsonResponse({ error: 'Place search failed.' }, 502);
    }
}
