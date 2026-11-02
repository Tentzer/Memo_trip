import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { CLASSIFY_FALLBACK_MESSAGE, parseClassifiedIntent } from './classify.ts';

Deno.test('parseClassifiedIntent accepts a JSON object', () => {
    const parsed = parseClassifiedIntent(
        '{"intent":"recommend","chatResponse":null,"searchQuery":"ramen Tokyo","exclude_prior_place_results":true}',
    );
    assertEquals(parsed.fallback, false);
    assertEquals(parsed.intent.intent, 'recommend');
    assertEquals(parsed.intent.searchQuery, 'ramen Tokyo');
    assertEquals(parsed.intent.exclude_prior_place_results, true);
});

Deno.test('parseClassifiedIntent accepts fenced JSON with surrounding prose', () => {
    const parsed = parseClassifiedIntent(
        'Sure!\n```json\n{"intent":"chat","chatResponse":"Hello","searchQuery":null}\n```\n',
    );
    assertEquals(parsed.fallback, false);
    assertEquals(parsed.intent.intent, 'chat');
    assertEquals(parsed.intent.chatResponse, 'Hello');
    assertEquals(parsed.intent.exclude_prior_place_results, false);
});

Deno.test('invalid JSON uses the chat fallback', () => {
    const parsed = parseClassifiedIntent('not json at all');
    assertEquals(parsed.fallback, true);
    assertEquals(parsed.intent.intent, 'chat');
    assertEquals(parsed.intent.chatResponse, CLASSIFY_FALLBACK_MESSAGE);
    assertEquals(parsed.intent.searchQuery, null);
});

Deno.test('unknown intent uses the chat fallback', () => {
    const parsed = parseClassifiedIntent('{"intent":"book_flight","chatResponse":"nope"}');
    assertEquals(parsed.fallback, true);
    assertEquals(parsed.intent.chatResponse, CLASSIFY_FALLBACK_MESSAGE);
});

Deno.test('non-boolean exclude flag stays false', () => {
    const parsed = parseClassifiedIntent(
        '{"intent":"plan","chatResponse":null,"searchQuery":null,"exclude_prior_place_results":"true"}',
    );
    assertEquals(parsed.fallback, false);
    assertEquals(parsed.intent.intent, 'plan');
    assertEquals(parsed.intent.exclude_prior_place_results, false);
});
