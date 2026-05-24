/**
 * One-time purge: hard-delete every memories row that is soft-deleted (deleted_at set)
 * and is not referenced by pending shares or marketplace source_memory_id.
 *
 * Prerequisites:
 * - Apply migration 20260520160000_purge_soft_deleted_memories.sql
 * - Env: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
 *
 * Usage:
 *   node scripts/purge-soft-deleted-memos-once.mjs --dry-run
 *   node scripts/purge-soft-deleted-memos-once.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function pathFromMemoryPublicUrl(url) {
    const trimmed = decodeURIComponent(String(url).trim());
    const markers = ['/object/public/memories/', '/storage/v1/object/public/memories/'];
    for (const marker of markers) {
        const index = trimmed.indexOf(marker);
        if (index !== -1) {
            return trimmed.slice(index + marker.length).split('?')[0] || null;
        }
    }
    return null;
}

async function removeStoragePaths(supabase, urls, dryRun) {
    const paths = [...new Set(urls.map(pathFromMemoryPublicUrl).filter(Boolean))];
    if (paths.length === 0) {
        return { paths: 0, errors: 0 };
    }

    if (dryRun) {
        console.log(`Would remove ${paths.length} storage object(s).`);
        return { paths: paths.length, errors: 0 };
    }

    const batchSize = 100;
    let errors = 0;
    for (let i = 0; i < paths.length; i += batchSize) {
        const batch = paths.slice(i, i + batchSize);
        const { error } = await supabase.storage.from('memories').remove(batch);
        if (error) {
            console.error('Storage batch delete failed:', error.message);
            errors += 1;
        }
    }
    return { paths: paths.length, errors };
}

async function runPurge(supabase, dryRun) {
    const { data, error } = await supabase.rpc('purge_unused_soft_deleted_memories', {
        p_dry_run: dryRun,
    });

    if (error) {
        throw new Error(error.message);
    }

    return data ?? {};
}

async function main() {
    loadRootEnv();

    const dryRun = process.argv.includes('--dry-run');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl) {
        console.error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in .env');
        process.exit(1);
    }
    if (!serviceKey) {
        console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → API → service_role).');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { count: softDeletedCount, error: countError } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null);

    if (countError) {
        console.error('Could not count soft-deleted rows:', countError.message);
        process.exit(1);
    }

    console.log(`Soft-deleted memos in database: ${softDeletedCount ?? 0}`);
    console.log(dryRun ? 'Dry run (no deletes).' : 'Live purge.');

    const result = await runPurge(supabase, dryRun);
    const storageUrls = Array.isArray(result.storage_urls) ? result.storage_urls : [];

    console.log('Result:', {
        dry_run: result.dry_run,
        purged: result.purged,
        skipped: result.skipped,
        storage_files: storageUrls.length,
    });

    const storageStats = await removeStoragePaths(supabase, storageUrls, dryRun);
    console.log('Storage:', storageStats);

    if (!dryRun) {
        const { count: remaining } = await supabase
            .from('memories')
            .select('id', { count: 'exact', head: true })
            .not('deleted_at', 'is', null);
        console.log(`Soft-deleted memos remaining (still in use): ${remaining ?? 0}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
