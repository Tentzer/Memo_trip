import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { readSupabaseAuthEnv, requireAuthenticatedUser } from './auth.ts';

function authed(token = 'user-jwt'): Request {
    return new Request('https://example.test/plan-agent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
}

Deno.test('missing Authorization is 401', async () => {
    const result = await requireAuthenticatedUser(
        new Request('https://example.test/plan-agent', { method: 'POST' }),
        () => Promise.resolve({ id: 'user-1' }),
    );
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) {
        assertEquals(result.status, 401);
        assertEquals(await result.json(), { error: 'Unauthorized' });
    }
});

Deno.test('empty bearer token is 401', async () => {
    const result = await requireAuthenticatedUser(
        new Request('https://example.test/plan-agent', {
            headers: { Authorization: 'Bearer ' },
        }),
        () => Promise.resolve({ id: 'user-1' }),
    );
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) assertEquals(result.status, 401);
});

Deno.test('verifier rejecting the token is 401', async () => {
    const result = await requireAuthenticatedUser(authed('anon-key'), () => Promise.resolve(null));
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) {
        assertEquals(result.status, 401);
        assertEquals(await result.json(), { error: 'Unauthorized' });
    }
});

Deno.test('verified user id is returned', async () => {
    const result = await requireAuthenticatedUser(authed(), () => Promise.resolve({ id: 'user-1' }));
    assertEquals(result instanceof Response, false);
    if (!(result instanceof Response)) assertEquals(result.userId, 'user-1');
});

Deno.test('verifier failures are a generic 503', async () => {
    const result = await requireAuthenticatedUser(authed(), () => {
        throw new Error('connect ECONNREFUSED db.internal');
    });
    assertEquals(result instanceof Response, true);
    if (result instanceof Response) {
        assertEquals(result.status, 503);
        const body = await result.json();
        assertEquals(body.error, 'Could not verify your session. Try again.');
        assertEquals(JSON.stringify(body).includes('db.internal'), false);
    }
});

Deno.test('auth env requires both url and anon key', () => {
    assertEquals(readSupabaseAuthEnv({ url: 'https://x.supabase.co', anonKey: 'anon' })?.url, 'https://x.supabase.co');
    assertEquals(readSupabaseAuthEnv({ url: 'https://x.supabase.co' }), null);
    assertEquals(readSupabaseAuthEnv({ anonKey: 'anon' }), null);
    assertEquals(readSupabaseAuthEnv({ url: '  ', anonKey: 'anon' }), null);
});
