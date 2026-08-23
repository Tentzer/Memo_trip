/**
 * One-time: reverse-geocode each memories row and set country + formatted_address.
 *
 * Prerequisites:
 * - Apply migration 20260516120000_memories_country_formatted_address.sql
 * - Google Cloud: Geocoding API enabled for your key
 * - Env (or root .env): SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API;
 *   never use the anon key). URL: SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL.
 *   Google: GOOGLE_MAPS_API_KEY or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
 *
 * Usage:
 *   node scripts/backfill-memory-country-address-once.mjs
 *   node scripts/backfill-memory-country-address-once.mjs --dry-run
 *   node scripts/backfill-memory-country-address-once.mjs --all   # overwrite existing country
 *
 * Delete this file after you have run it successfully.
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

const usStateAbbreviationDisplayNames = {
    ca: 'California',
    ny: 'New York',
    va: 'Virginia',
};

function toDisplayFolderName(value) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toFolderLookupKey(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeLocationFolderName(value) {
    const displayName = toDisplayFolderName(value);
    return usStateAbbreviationDisplayNames[toFolderLookupKey(displayName)] ?? displayName;
}

function folderFromAddressComponents(components) {
    if (!components?.length) return '';
    const country = components.find((c) => c.types.includes('country'));
    const admin1 = components.find((c) => c.types.includes('administrative_area_level_1'));
    const isUS = country?.short_name === 'US';
    if (isUS && admin1?.long_name?.trim()) {
        return normalizeLocationFolderName(admin1.long_name);
    }
    const countryName = country?.long_name?.trim();
    return countryName ? normalizeLocationFolderName(countryName) : '';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function reverseGeocode(lat, lng, apiKey) {
    const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        key: apiKey,
    });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.status === 'ZERO_RESULTS') {
        return { folder: '', formatted: '' };
    }
    if (data.status !== 'OK' || !data.results?.[0]) {
        throw new Error(`Geocode ${data.status}: ${data.error_message || ''}`.trim());
    }
    const top = data.results[0];
    const folder = folderFromAddressComponents(top.address_components);
    const formatted = typeof top.formatted_address === 'string' ? top.formatted_address : '';
    return { folder, formatted };
}

async function main() {
    loadRootEnv();

    const dryRun = process.argv.includes('--dry-run');
    const all = process.argv.includes('--all');

    const supabaseUrl =
        process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const googleKey =
        process.env.GOOGLE_MAPS_API_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
        '';

    if (!supabaseUrl) {
        console.error(
            'Missing project URL: set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL (e.g. in .env).',
        );
        process.exit(1);
    }
    if (!serviceKey) {
        console.error(
            'Missing SUPABASE_SERVICE_ROLE_KEY. Add it temporarily to .env for this script only.',
        );
        console.error(
            'Supabase Dashboard → Project Settings → API → service_role (secret). Do not ship this key in the app.',
        );
        process.exit(1);
    }
    if (!googleKey) {
        console.error('Missing GOOGLE_MAPS_API_KEY or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: rows, error: qError } = await supabase
        .from('memories')
        .select('id, latitude, longitude, country')
        .is('deleted_at', null)
        .order('id');

    if (qError || !rows) {
        console.error('Query failed:', qError?.message);
        process.exit(1);
    }

    const targets = all
        ? rows
        : rows.filter((r) => r.country == null || String(r.country).trim() === '');

    console.log(`Rows total: ${rows.length}, to update: ${targets.length}${dryRun ? ' (dry-run)' : ''}`);

    let ok = 0;
    let fail = 0;
    const delayMs = 120;

    for (let i = 0; i < targets.length; i++) {
        const row = targets[i];
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            console.warn(`Skip ${row.id}: invalid lat/lng`);
            fail++;
            continue;
        }

        try {
            const { folder, formatted } = await reverseGeocode(lat, lng, googleKey);
            const countryVal = folder || 'Unknown Location';
            if (dryRun) {
                console.log(`[dry-run] ${row.id}: country=${countryVal}`);
            } else {
                const { error: uError } = await supabase
                    .from('memories')
                    .update({
                        country: countryVal,
                        formatted_address: formatted || null,
                    })
                    .eq('id', row.id);
                if (uError) {
                    console.error(`Update failed ${row.id}:`, uError.message);
                    fail++;
                } else {
                    ok++;
                    if ((ok + fail) % 25 === 0) {
                        console.log(`Progress: ${ok + fail}/${targets.length}`);
                    }
                }
            }
        } catch (e) {
            console.error(`Geocode failed ${row.id}:`, e?.message || e);
            fail++;
        }

        await sleep(delayMs);
    }

    console.log(dryRun ? 'Dry-run done.' : `Done. Updated: ${ok}, failures: ${fail}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
