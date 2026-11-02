import { authenticateRequest } from '../_shared/auth_supabase.ts';
import { consumeEdgeDailyRequest } from '../_shared/rate_limit_supabase.ts';
import { handlePlacesProxy } from './handler.ts';

const photoCache = new Map<string, string[]>();

Deno.serve((req) => handlePlacesProxy(req, {
    authenticate: authenticateRequest,
    increment: consumeEdgeDailyRequest,
    apiKey: () => Deno.env.get('BRAVE_SEARCH_API_KEY'),
    dailyLimit: () => Deno.env.get('PLACES_PROXY_DAILY_LIMIT'),
    photoCache,
}));
