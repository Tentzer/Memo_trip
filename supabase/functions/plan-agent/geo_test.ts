import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { filterAndRankNearMePlaces, haversineDistanceMeters } from './geo.ts';

import { nearMeDiagnostics } from './near_me_metrics.ts';

import type { RecommendedPlace } from './plan_agent_types.ts';

function pit(): RecommendedPlace {
    return {
        name: '',
        address: '',
        rating: 0,
        userRatingsTotal: 0,
        placeId: '',
        photoReference: null,
        lat: 0,
        lng: 0,
        country: '',
        description: '',
    };
}

Deno.test('haversine is ~0 for same point', () => {
    const d = haversineDistanceMeters(51.5074, -0.1278, 51.5074, -0.1278);
    assertEquals(Math.round(d), 0);
});

/**
 * Fixture: Burger A is 650m north of user; Burger B is 4900m away with higher rating.
 * Distance-first selects A before B within a 5200m cap (reproduce "don't cross cities").
 */
Deno.test('near me ranks closer venue before farther high-rated burger', () => {
    const userLat = 32.0853;
    const userLng = 34.7818;
    const close: RecommendedPlace = {
        ...pit(),
        name: 'Close Burger',
        placeId: 'a',
        rating: 4,
        lat: userLat + 0.0059,
        lng: userLng,
    };
    const far: RecommendedPlace = {
        ...pit(),
        name: 'Far Famous Burger',
        placeId: 'b',
        rating: 5,
        lat: userLat + 0.042,
        lng: userLng,
    };
    const sorted = filterAndRankNearMePlaces(userLat, userLng, [far, close], 5200, 0, 5, false);
    assertEquals(sorted.length, 2);
    assertEquals(sorted[0]!.placeId, 'a');
});

Deno.test('legacy rating-first favors distant superstar (regression sentinel)', () => {
    const userLat = 32.0853;
    const userLng = 34.7818;
    const close: RecommendedPlace = {
        ...pit(),
        placeId: 'a',
        rating: 4,
        lat: userLat + 0.0059,
        lng: userLng,
    };
    const far: RecommendedPlace = {
        ...pit(),
        placeId: 'b',
        rating: 5,
        lat: userLat + 0.042,
        lng: userLng,
    };
    const sorted = filterAndRankNearMePlaces(userLat, userLng, [far, close], 5200, 0, 5, true);
    assertEquals(sorted[0]!.placeId, 'b');
});

Deno.test('nearMeDiagnostics aggregates within-radius share', () => {
    const d = nearMeDiagnostics([500, 2000, 3500], 3000);
    assertEquals(d.count, 3);
    assertEquals(d.fractionWithinBucket, 2 / 3);
    assertEquals(typeof d.medianMeters === 'number' && d.medianMeters > 0, true);
});
