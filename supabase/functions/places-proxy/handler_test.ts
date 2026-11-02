import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { jsonResponse } from '../_shared/http.ts';
import { handlePlacesProxy, type PlacesProxyDeps } from './handler.ts';

const SUSHI = {
    id: 'loc4G4LX7WYT25AUBNMX',
    title: 'Sushi Dai',
    url: 'https://sushidai.example',
    description: 'Sushi Restaurant',
    coordinates: [35.665, 139.77],
    postal_address: { displayAddress: '5-2-1 Tsukiji, Tokyo' },
    opening_hours: {
        current_day: [{ full_name: 'Monday', opens: '11:00', closes: '14:00' }],
    },
    contact: { telephone: '+81 3-0000-0000' },
    rating: { ratingValue: 4.6, bestRating: 5, reviewCount: 12 },
    pictures: {
        results: [
            { src: 'https://imgs.search.brave.com/thumb-1', original: 'https://cdn.example/full-1.jpg' },
            { src: 'https://imgs.search.brave.com/thumb-2' },
            { src: 'https://imgs.search.brave.com/logo', logo: true },
        ],
    },
    serves_cuisine: ['Japanese'],
    categories: ['restaurant'],
};

function request(body?: unknown, token = 'user-jwt'): Request {
    return new Request('https://example.test/places-proxy', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function deps(overrides: Partial<PlacesProxyDeps> = {}): PlacesProxyDeps & { calls: { url: string; token: string | null }[] } {
    const calls: { url: string; token: string | null }[] = [];
    const base: PlacesProxyDeps = {
        authenticate: () => Promise.resolve({ userId: 'user-1' }),
        increment: () => Promise.resolve(1),
        apiKey: () => 'brave-secret',
        dailyLimit: () => '10',
        photoCache: new Map(),
        fetchImpl: (input, init) => {
            const headers = new Headers(init?.headers);
            calls.push({ url: String(input), token: headers.get('X-Subscription-Token') });
            return Promise.resolve(new Response(JSON.stringify({ type: 'locations', results: [SUSHI] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        },
        ...overrides,
    };
    return Object.assign(base, { calls });
}

Deno.test('missing session is unauthorized', async () => {
    const result = await handlePlacesProxy(request({ op: 'search', query: 'sushi' }), deps({
        authenticate: () => Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401)),
    }));
    assertEquals(result.status, 401);
});

Deno.test('daily cap uses the edge counter and does not call Brave', async () => {
    const harness = deps({
        dailyLimit: () => '2',
        increment: () => Promise.resolve(3),
    });
    const result = await handlePlacesProxy(request({ op: 'search', query: 'sushi' }), harness);
    assertEquals(result.status, 429);
    assertEquals(await result.json(), { error: 'Daily limit of 2 place searches reached. Try again tomorrow.' });
    assertEquals(harness.calls.length, 0);
});

Deno.test('missing Brave key is a configuration error without the secret name', async () => {
    const result = await handlePlacesProxy(request({ op: 'search', query: 'sushi' }), deps({
        apiKey: () => '  ',
    }));
    assertEquals(result.status, 500);
    const body = await result.json();
    assertEquals(body.error, 'Place search is not configured.');
    assertEquals(JSON.stringify(body).includes('BRAVE'), false);
});

Deno.test('search calls Brave with the server token and omits photo urls', async () => {
    const harness = deps();
    const result = await handlePlacesProxy(request({
        op: 'search',
        query: 'sushi',
        latitude: 35.6,
        longitude: 139.7,
    }), harness);
    assertEquals(result.status, 200);
    const body = await result.json();
    assertEquals(harness.calls.length, 1);
    assertEquals(harness.calls[0]?.token, 'brave-secret');
    assertEquals(harness.calls[0]?.url.includes('q=sushi'), true);
    assertEquals(harness.calls[0]?.url.includes('latitude=35.6'), true);
    assertEquals(harness.calls[0]?.url.includes('brave-secret'), false);
    assertEquals(body.predictions[0].place_id, 'loc4G4LX7WYT25AUBNMX');
    assertEquals(body.predictions[0].category, 'sushi');
    assertEquals(body.predictions[0].structured_formatting.main_text, 'Sushi Dai');
    assertEquals(body.predictions[0].phone, '+81 3-0000-0000');
    assertEquals(body.predictions[0].hours, 'Monday: 11:00-14:00');
    assertEquals(Object.hasOwn(body.predictions[0], 'photoUrls'), false);
    assertEquals(JSON.stringify(body).includes('brave-secret'), false);
});

Deno.test('photos after search reuse the cached picture urls', async () => {
    const harness = deps();
    await handlePlacesProxy(request({ op: 'search', query: 'sushi' }), harness);
    const photos = await handlePlacesProxy(request({
        op: 'photos',
        placeId: 'loc4G4LX7WYT25AUBNMX',
    }), harness);
    assertEquals(photos.status, 200);
    assertEquals(await photos.json(), {
        photos: ['https://imgs.search.brave.com/thumb-1', 'https://imgs.search.brave.com/thumb-2'],
    });
    assertEquals(harness.calls.length, 1);
});

Deno.test('details can be recovered from title and coordinates when the id misses', async () => {
    const harness = deps();
    const result = await handlePlacesProxy(request({
        op: 'details',
        placeId: 'loc-not-in-this-page',
        title: 'Sushi Dai',
        latitude: 35.665,
        longitude: 139.77,
    }), harness);
    assertEquals(result.status, 200);
    const body = await result.json();
    assertEquals(body.place.placeId, 'loc4G4LX7WYT25AUBNMX');
    assertEquals(body.place.title, 'Sushi Dai');
    assertEquals(body.place.address, '5-2-1 Tsukiji, Tokyo');
    assertEquals(body.place.photoReference, null);
    assertEquals(body.place.placePhotos, [
        { thumb: 'https://imgs.search.brave.com/thumb-1', full: 'https://cdn.example/full-1.jpg' },
        { thumb: 'https://imgs.search.brave.com/thumb-2', full: 'https://imgs.search.brave.com/thumb-2' },
    ]);
});
