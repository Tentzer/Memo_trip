import polyline from '@mapbox/polyline';

export interface LatLng {
    latitude: number;
    longitude: number;
}

/** Walking preview only within this great-circle distance (meters). */
export const MAX_WALKING_PREVIEW_METERS = 50_000;

/** Cap decoded polyline points before passing to react-native-maps Polyline. */
export const MAX_POLYLINE_POINTS = 600;

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two WGS84 points (meters).
 */
export function haversineDistanceMeters(
    a: LatLng,
    b: LatLng
): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h =
        sinDLat * sinDLat +
        Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_M * c;
}

function decodeGooglePolyline(encoded: string): LatLng[] {
    const points = polyline.decode(encoded);
    return points.map((p) => ({ latitude: p[0], longitude: p[1] }));
}

/**
 * Uniform decimation so the native map never receives an oversized coordinate array.
 */
export function decimateCoordinates(points: LatLng[], maxPoints: number): LatLng[] {
    if (points.length <= maxPoints) return points;
    const n = points.length;
    const out: LatLng[] = [];
    for (let i = 0; i < maxPoints; i++) {
        const idx = Math.floor((i * (n - 1)) / Math.max(1, maxPoints - 1));
        out.push(points[idx]);
    }
    return out;
}

export type WalkingRouteResult =
    | { ok: true; coordinates: LatLng[]; distanceText: string }
    | { ok: false; code: 'too_far' | 'no_location' | 'no_api_key' | 'no_route' | 'network' | 'bad_response'; message: string };

/**
 * Fetches a walking route from Google Directions API with guards and safe polyline size.
 */
export async function fetchWalkingRoutePreview(
    origin: LatLng,
    destination: LatLng,
    apiKey: string | undefined
): Promise<WalkingRouteResult> {
    if (!apiKey?.trim()) {
        return { ok: false, code: 'no_api_key', message: 'Maps API key is not configured.' };
    }

    const straightM = haversineDistanceMeters(origin, destination);
    if (straightM > MAX_WALKING_PREVIEW_METERS) {
        return {
            ok: false,
            code: 'too_far',
            message:
                'This place is too far away to preview a walking route on the map. Use Drive with Waze for turn-by-turn directions.',
        };
    }

    const params = new URLSearchParams({
        origin: `${origin.latitude},${origin.longitude}`,
        destination: `${destination.latitude},${destination.longitude}`,
        mode: 'walking',
        key: apiKey.trim(),
    });

    let data: {
        status?: string;
        error_message?: string;
        routes?: { overview_polyline?: { points?: string }; legs?: { distance?: { text?: string } }[] }[];
    };

    try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
        data = await res.json();
    } catch {
        return { ok: false, code: 'network', message: 'Could not reach Google Directions. Check your connection.' };
    }

    if (data.status !== 'OK' || !data.routes?.length) {
        const hint = data.error_message ? ` (${data.error_message})` : '';
        return {
            ok: false,
            code: 'no_route',
            message:
                data.status === 'ZERO_RESULTS'
                    ? 'No walking route was found for this trip. Try Waze for driving directions.'
                    : `No route available${hint}.`,
        };
    }

    const route = data.routes[0];
    const encoded = route.overview_polyline?.points;
    if (!encoded) {
        return { ok: false, code: 'bad_response', message: 'Unexpected response from directions service.' };
    }

    const decoded = decodeGooglePolyline(encoded);
    const coordinates = decimateCoordinates(decoded, MAX_POLYLINE_POINTS);
    const distanceText = route.legs?.[0]?.distance?.text ?? '';

    return {
        ok: true,
        coordinates,
        distanceText,
    };
}
