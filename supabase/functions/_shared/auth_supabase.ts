import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { readSupabaseAuthEnv, requireAuthenticatedUser, type AuthResult, type AuthUser } from './auth.ts';
import { jsonResponse } from './http.ts';

export async function verifySupabaseUser(
    token: string,
    env: { url: string; anonKey: string },
): Promise<AuthUser | null> {
    const client = createClient(env.url, env.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return { id: data.user.id };
}

/** Valid user JWT required. The anon key is not a user. */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
    const env = readSupabaseAuthEnv({
        url: Deno.env.get('SUPABASE_URL'),
        anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    });
    if (!env) {
        return jsonResponse({ error: 'Auth is not configured.' }, 500);
    }
    return requireAuthenticatedUser(req, (token) => verifySupabaseUser(token, env));
}
