import { jsonResponse } from './http.ts';

export type AuthUser = { id: string };

export type VerifyBearer = (token: string) => Promise<AuthUser | null>;

export type AuthResult = { userId: string } | Response;

const BEARER = /^Bearer\s+(\S+)$/i;

export function readBearerToken(req: Request): string | null {
    const header = req.headers.get('Authorization') ?? '';
    const match = BEARER.exec(header.trim());
    return match?.[1] ?? null;
}

export function readSupabaseAuthEnv(env: {
    url?: string;
    anonKey?: string;
}): { url: string; anonKey: string } | null {
    const url = env.url?.trim() ?? '';
    const anonKey = env.anonKey?.trim() ?? '';
    if (!url || !anonKey) return null;
    return { url, anonKey };
}

/** Rejects missing or unverified credentials. Network failures become a generic 503. */
export async function requireAuthenticatedUser(
    req: Request,
    verify: VerifyBearer,
): Promise<AuthResult> {
    const token = readBearerToken(req);
    if (!token) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    try {
        const user = await verify(token);
        if (!user?.id) {
            return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        return { userId: user.id };
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('auth verify failed:', detail);
        return jsonResponse({ error: 'Could not verify your session. Try again.' }, 503);
    }
}
