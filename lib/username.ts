import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 40;

export const USERNAME_INVALID_MESSAGE =
    `Use ${USERNAME_MIN_LEN}-${USERNAME_MAX_LEN} characters: letters, numbers, spaces, hyphens, or apostrophes (include at least one letter).`;

/** Trims and collapses internal whitespace for username lookup (preserves casing). */
export function normalizeUsernameInput(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}

/** Trims and collapses internal whitespace; preserves casing. */
export function normalizeDisplayName(raw: string): string | null {
    const collapsed = raw.trim().replace(/\s+/g, ' ');
    if (collapsed.length < USERNAME_MIN_LEN || collapsed.length > USERNAME_MAX_LEN) {
        return null;
    }
    if (!/^[\p{L}\p{M}\p{N} \-']+$/u.test(collapsed)) {
        return null;
    }
    if (!/\p{L}/u.test(collapsed)) {
        return null;
    }
    return collapsed;
}

/** True when input meets all username rules (length, characters, at least one letter). */
export function isUsernameInputValid(raw: string): boolean {
    return normalizeDisplayName(raw) !== null;
}

export function suggestUsernameFromUser(user: User): string {
    const meta = user.user_metadata ?? {};
    const fromMeta = typeof meta.username === 'string' ? meta.username.trim() : '';
    if (fromMeta) return fromMeta;

    const fullName =
        (typeof meta.full_name === 'string' ? meta.full_name : '') ||
        (typeof meta.name === 'string' ? meta.name : '');
    if (fullName.trim()) return fullName.trim().replace(/\s+/g, ' ');

    const emailLocal = user.email?.split('@')[0]?.trim() ?? '';
    return emailLocal.replace(/[^a-zA-Z0-9 \-']/g, '');
}

export type ClaimUsernameResult =
    | { ok: true; username: string }
    | { ok: false; error: string };

export async function claimUsername(raw: string): Promise<ClaimUsernameResult> {
    const displayName = normalizeDisplayName(raw);
    if (!displayName) {
        return { ok: false, error: USERNAME_INVALID_MESSAGE };
    }

    const { data, error } = await supabase.rpc('set_own_username', {
        p_username: displayName,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    const payload = data as { ok?: boolean; error?: string; username?: string } | null;
    if (!payload?.ok) {
        if (payload?.error === 'username_taken') {
            return { ok: false, error: 'That username is already in use. Please choose a different one.' };
        }
        if (payload?.error === 'invalid_username') {
            return { ok: false, error: USERNAME_INVALID_MESSAGE };
        }
        return { ok: false, error: payload?.error ?? 'Could not save username.' };
    }

    const username = payload.username ?? displayName;
    const { error: metaError } = await supabase.auth.updateUser({
        data: { username },
    });
    if (metaError) {
        return { ok: false, error: metaError.message };
    }

    return { ok: true, username };
}

export async function fetchProfileUsername(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('fetchProfileUsername failed:', error.message);
        return null;
    }

    const trimmed = data?.username?.trim();
    return trimmed ? trimmed : null;
}
