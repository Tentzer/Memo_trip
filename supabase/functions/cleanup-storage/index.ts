/**
 * Admin-only: remove Storage objects in bucket `memories` that no DB row references.
 *
 * Memories: only rows with deleted_at IS NULL count as referencing a file. If every memo
 * for that image_url is archived, that path is not considered referenced here (unless
 * another table still references it).
 *
 * Deploy:
 *   supabase secrets set CLEANUP_STORAGE_SECRET=<random-long-string>
 *   supabase functions deploy cleanup-storage --no-verify-jwt
 *
 * Invoke (dry run):
 *   curl -s "$SUPABASE_URL/functions/v1/cleanup-storage?dry_run=true" \
 *     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
 *     -H "x-cleanup-secret: $CLEANUP_STORAGE_SECRET"
 *
 * Invoke (delete):
 *   curl -s "$SUPABASE_URL/functions/v1/cleanup-storage" \
 *     -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
 *     -H "x-cleanup-secret: $CLEANUP_STORAGE_SECRET"
 *
 * Schedule: Supabase Dashboard → Edge Functions → cron, or external cron hitting this URL.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const BUCKET = 'memories';
const PAGE = 500;

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-cleanup-secret, content-type',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/** Path inside bucket `memories`, e.g. `uuid.jpg` or `library-covers/foo.jpg`. */
function pathFromPublicUrl(url: string): string | null {
    const trimmed = decodeURIComponent(url.trim());
    const markers = ['/object/public/memories/', '/storage/v1/object/public/memories/'];
    for (const m of markers) {
        const i = trimmed.indexOf(m);
        if (i !== -1) {
            return trimmed.slice(i + m.length).split('?')[0] || null;
        }
    }
    return null;
}

function addUrls(set: Set<string>, urls: (string | null | undefined)[]): void {
    for (const u of urls) {
        if (!u) continue;
        const p = pathFromPublicUrl(u);
        if (p) set.add(p);
    }
}

async function fetchReferencedPaths(supabase: ReturnType<typeof createClient>): Promise<Set<string>> {
    const refs = new Set<string>();
    let from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('memories')
            .select('image_url')
            .is('deleted_at', null)
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`memories: ${error.message}`);
        if (!data?.length) break;
        addUrls(
            refs,
            data.map((r: { image_url?: string }) => r.image_url),
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }

    from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('market_photos')
            .select('image_url')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`market_photos: ${error.message}`);
        if (!data?.length) break;
        addUrls(
            refs,
            data.map((r: { image_url?: string }) => r.image_url),
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }

    from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('libraries')
            .select('cover_image_url')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`libraries: ${error.message}`);
        if (!data?.length) break;
        addUrls(
            refs,
            data.map((r: { cover_image_url?: string }) => r.cover_image_url),
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }

    from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('market_libraries')
            .select('cover_image_url')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`market_libraries: ${error.message}`);
        if (!data?.length) break;
        addUrls(
            refs,
            data.map((r: { cover_image_url?: string }) => r.cover_image_url),
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }

    from = 0;
    for (;;) {
        const { data, error } = await supabase
            .from('pending_shares')
            .select('image_uri')
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`pending_shares: ${error.message}`);
        if (!data?.length) break;
        addUrls(
            refs,
            data.map((r: { image_uri?: string }) => r.image_uri),
        );
        if (data.length < PAGE) break;
        from += PAGE;
    }

    return refs;
}

async function listStoragePathsRecursive(
    supabase: ReturnType<typeof createClient>,
    prefix: string,
): Promise<string[]> {
    const out: string[] = [];
    let offset = 0;
    for (;;) {
        const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
            limit: PAGE,
            offset,
            sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw new Error(`storage.list(${prefix}): ${error.message}`);
        if (!data?.length) break;

        for (const item of data) {
            const path = prefix ? `${prefix}/${item.name}` : item.name;
            const isFolder = item.metadata == null;
            if (isFolder) {
                const nested = await listStoragePathsRecursive(supabase, path);
                out.push(...nested);
            } else {
                out.push(path);
            }
        }

        if (data.length < PAGE) break;
        offset += PAGE;
    }
    return out;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const secret = Deno.env.get('CLEANUP_STORAGE_SECRET') ?? '';
    const headerSecret = req.headers.get('x-cleanup-secret') ?? '';

    if (!secret || headerSecret !== secret) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
        return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const url = new URL(req.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';

    try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const referenced = await fetchReferencedPaths(supabase);
        const allPaths = await listStoragePathsRecursive(supabase, '');
        const orphans = allPaths.filter((p) => !referenced.has(p));

        if (dryRun) {
            return json({
                dry_run: true,
                bucket: BUCKET,
                referenced_count: referenced.size,
                storage_object_count: allPaths.length,
                orphan_count: orphans.length,
                orphans_preview: orphans.slice(0, 50),
            });
        }

        const BATCH = 100;
        let deleted = 0;
        const errors: string[] = [];

        for (let i = 0; i < orphans.length; i += BATCH) {
            const chunk = orphans.slice(i, i + BATCH);
            const { error } = await supabase.storage.from(BUCKET).remove(chunk);
            if (error) {
                errors.push(error.message);
            } else {
                deleted += chunk.length;
            }
        }

        return json({
            dry_run: false,
            bucket: BUCKET,
            orphan_count: orphans.length,
            deleted,
            errors: errors.length ? errors : undefined,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('cleanup-storage:', msg);
        return json({ error: msg }, 500);
    }
});
