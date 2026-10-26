import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { userMessageForStatus, userMessageFromInvokeError } from '../../../lib/paidEndpointError.ts';

Deno.test('401 and 429 become user-facing messages', async () => {
    assertEquals(
        userMessageForStatus(401, 'Unauthorized', 'plan'),
        'Please sign in again to use trip planning.',
    );
    assertEquals(
        userMessageForStatus(401, 'Unauthorized', 'import'),
        'Please sign in again to import a video.',
    );

    const response = new Response(
        JSON.stringify({ error: 'Daily limit of 20 video imports reached. Try again tomorrow.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
    const message = await userMessageFromInvokeError({ context: response }, 'import');
    assertEquals(message, 'Daily limit of 20 video imports reached. Try again tomorrow.');
});

Deno.test('a long server error is not shown raw', () => {
    const huge = 'x'.repeat(400);
    assertEquals(
        userMessageForStatus(500, huge, 'plan'),
        'Something went wrong. Please try again.',
    );
});
