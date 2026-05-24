import { normalizeUsernameInput } from '@/lib/username';
import { supabase } from '@/lib/supabase';

export type RecipientProfile = { id: string; email: string };

/**
 * Resolve friend recipient for shares: username looks up profiles.email; strings containing `@` use email lookup.
 */
export async function resolveRecipientProfile(raw: string): Promise<RecipientProfile | null> {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed.includes('@')) {
        const emailNorm = trimmed.toLowerCase();
        const { data, error } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', emailNorm)
            .maybeSingle();
        if (error || !data?.id || !data.email) return null;
        return { id: String(data.id), email: data.email };
    }

    const normalizedUsername = normalizeUsernameInput(trimmed);
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('username', normalizedUsername)
        .maybeSingle();

    if (error || !data?.id || !data.email) return null;
    return { id: String(data.id), email: data.email };
}
