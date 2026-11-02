import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
    dailyLimitMessage,
    enforceDailyLimit,
    readDailyLimit,
    utcDateString,
} from './rate_limit.ts';

Deno.test('utcDateString uses the UTC day', () => {
    assertEquals(utcDateString(new Date('2026-10-26T23:30:00Z')), '2026-10-26');
    assertEquals(utcDateString(new Date('2026-10-26T23:30:00-05:00')), '2026-10-27');
});

Deno.test('readDailyLimit falls back on empty or invalid values', () => {
    assertEquals(readDailyLimit(undefined, 40), 40);
    assertEquals(readDailyLimit('  ', 40), 40);
    assertEquals(readDailyLimit('0', 40), 40);
    assertEquals(readDailyLimit('-3', 40), 40);
    assertEquals(readDailyLimit('nope', 40), 40);
    assertEquals(readDailyLimit('100001', 40), 40);
    assertEquals(readDailyLimit('15', 40), 15);
});

Deno.test('count within the limit is allowed and records the UTC day', async () => {
    let seenDay = '';
    const result = await enforceDailyLimit(
        (_userId, _endpoint, day) => {
            seenDay = day;
            return Promise.resolve(5);
        },
        {
            userId: 'user-1',
            endpoint: 'plan-agent',
            limit: 5,
            now: new Date('2026-10-26T23:30:00-05:00'),
        },
    );
    assertEquals(result, null);
    assertEquals(seenDay, '2026-10-27');
});

Deno.test('count above the limit is 429 with the caller message', async () => {
    const result = await enforceDailyLimit(
        () => Promise.resolve(41),
        {
            userId: 'user-1',
            endpoint: 'plan-agent',
            limit: 40,
            message: dailyLimitMessage(40, 'trip plans'),
        },
    );
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) {
        assertEquals(result.status, 429);
        assertEquals(await result.json(), {
            error: 'Daily limit of 40 trip plans reached. Try again tomorrow.',
        });
    }
});

Deno.test('store failures are a generic 503', async () => {
    const result = await enforceDailyLimit(
        () => Promise.reject(new Error('relation public.edge_daily_requests does not exist')),
        { userId: 'user-1', endpoint: 'import-video-job', limit: 20 },
    );
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) {
        assertEquals(result.status, 503);
        const body = await result.json();
        assertEquals(body.error, 'Rate limiting is unavailable. Try again later.');
        assertEquals(JSON.stringify(body).includes('edge_daily_requests'), false);
    }
});
