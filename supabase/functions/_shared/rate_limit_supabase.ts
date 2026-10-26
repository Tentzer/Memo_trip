import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** Service-role increment of public.consume_edge_daily_request. */
export async function consumeEdgeDailyRequest(
    userId: string,
    endpoint: string,
    usageDate: string,
): Promise<number> {
    const url = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
    if (!url || !serviceKey) {
        throw new Error('Rate limit store is not configured.');
    }

    const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('consume_edge_daily_request', {
        p_user_id: userId,
        p_endpoint: endpoint,
        p_usage_date: usageDate,
    });
    if (error) {
        throw new Error(error.message);
    }

    const count = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(count)) {
        throw new Error('Rate limit counter returned an invalid count.');
    }
    return count;
}
