/**
 * One-time: build ~200px JPEG pin thumbnails for memories.thumb_uri.
 *
 * Prerequisites:
 * - Apply migration 20261026072125_pin_thumbs_and_edge_rate_limits.sql
 * - Env (or root .env): SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL
 *   (or EXPO_PUBLIC_SUPABASE_URL). Never use the anon key.
 * - Optional: PIN_THUMB_MAX_EDGE (default 200, clamped 32–512)
 * - Optional: PIN_THUMB_JPEG_QUALITY (default 72, range 40–90)
 *
 * Usage:
 *   npm run backfill:memory-thumbs -- --dry-run
 *   npm run backfill:memory-thumbs
 *   npm run backfill:memory-thumbs -- --force --limit 50
 *
 * Rows that already have thumb_uri are skipped unless --force is set.
 * Marketplace downloads created after this run need another pass.
 * Image decode/resize uses the imagescript devDependency under its MIT license.
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Image } from 'imagescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = 50;

function loadRootEnv() {
    const p = join(__dirname, '..', '.env');
    if (!existsSync(p)) return;
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
    }
}

function intInRange(raw, fallback, min, max) {
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return n;
}

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run');
    const force = argv.includes('--force');
    const limitIdx = argv.indexOf('--limit');
    let limit = Infinity;
    if (limitIdx !== -1) {
        limit = Number(argv[limitIdx + 1]);
        if (!Number.isFinite(limit) || limit < 1) {
            throw new Error('--limit expects a positive integer');
        }
    }
    return { dryRun, force, limit };
}

function resizeLongestEdge(image, maxEdge) {
    if (Math.max(image.width, image.height) <= maxEdge) return image;
    return image.contain(maxEdge, maxEdge, Image.RESIZE_AREA);
}

async function thumbnailBytes(source, maxEdge, quality) {
    const decoded = await Image.decode(source);
    if (!(decoded instanceof Image)) {
        throw new Error('Animated images are not used for pin thumbnails.');
    }
    const sized = resizeLongestEdge(decoded, maxEdge);
    return sized.encodeJPEG(quality);
}

async function main() {
    loadRootEnv();
    const { dryRun, force, limit } = parseArgs(process.argv.slice(2));
    const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Set SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
    }

    const maxEdge = intInRange(process.env.PIN_THUMB_MAX_EDGE, 200, 32, 512);
    const quality = intInRange(process.env.PIN_THUMB_JPEG_QUALITY, 72, 40, 90);
    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const thumbBySource = new Map();
    let scanned = 0;
    let written = 0;
    let failed = 0;
    let lastId = null;

    while (scanned < limit) {
        const pageSize = Math.min(PAGE, limit - scanned);
        let query = supabase
            .from('memories')
            .select('id, image_url, thumb_uri')
            .order('id', { ascending: true })
            .limit(pageSize);
        if (!force) query = query.is('thumb_uri', null);
        if (lastId) query = query.gt('id', lastId);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        if (!data?.length) break;

        for (const row of data) {
            lastId = row.id;
            scanned += 1;
            const imageUrl = typeof row.image_url === 'string' ? row.image_url.trim() : '';
            if (!imageUrl) {
                console.error(`skip ${row.id}: empty image_url`);
                failed += 1;
                continue;
            }

            if (dryRun) {
                console.log(`would thumbnail ${row.id}`);
                written += 1;
                continue;
            }

            try {
                let thumbUrl = thumbBySource.get(imageUrl);
                if (!thumbUrl) {
                    const response = await fetch(imageUrl);
                    if (!response.ok) {
                        throw new Error(`download ${response.status}`);
                    }
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    const jpeg = await thumbnailBytes(bytes, maxEdge, quality);
                    const path = `thumbs/${row.id}.jpg`;
                    const { error: uploadError } = await supabase.storage.from('memories').upload(path, jpeg, {
                        contentType: 'image/jpeg',
                        upsert: true,
                    });
                    if (uploadError) throw new Error(uploadError.message);
                    thumbUrl = supabase.storage.from('memories').getPublicUrl(path).data.publicUrl;
                    thumbBySource.set(imageUrl, thumbUrl);
                }

                const { error: updateError } = await supabase
                    .from('memories')
                    .update({ thumb_uri: thumbUrl })
                    .eq('id', row.id);
                if (updateError) throw new Error(updateError.message);
                written += 1;
                console.log(`thumb ${row.id}`);
            } catch (err) {
                failed += 1;
                const message = err instanceof Error ? err.message : String(err);
                console.error(`fail ${row.id}: ${message}`);
            }
        }

        if (data.length < pageSize) break;
    }

    console.log(JSON.stringify({ dryRun, force, scanned, written, failed, maxEdge, quality }));
    if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
});
