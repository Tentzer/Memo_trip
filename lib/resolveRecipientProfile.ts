import { supabase } from '@/lib/supabase';

export type RecipientProfile = { id: string; email: string };

/**
 * Resolve friend recipient for shares: username uses canonical DB match; strings containing `@` use email lookup.
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

    const { data: resolvedEmail, error: rpcError } = await supabase.rpc('email_for_username', {
        p_username: trimmed,
    });

    if (rpcError || typeof resolvedEmail !== 'string' || !resolvedEmail.trim()) {
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', resolvedEmail.trim())
        .maybeSingle();

    if (profileError || !profile?.id || !profile.email) return null;
    return { id: String(profile.id), email: profile.email };
}
