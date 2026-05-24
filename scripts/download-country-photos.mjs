#!/usr/bin/env node
/**
 * Download country/state folder photos and compress (~1–2 MB, max 1600px).
 *
 * Unsplash (preferred if key set):
 *   export UNSPLASH_ACCESS_KEY=...   # https://unsplash.com/oauth/applications
 *
 * Otherwise uses Wikimedia Commons search (free, no key).
 *
 * Usage:
 *   node scripts/download-country-photos.mjs
 *   node scripts/download-country-photos.mjs --only Texas.jpg,Peru.jpg
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PHOTO_DIR = join(ROOT, 'assets/country-photos');
const MAX_EDGE = 1600;
const TARGET_MAX_BYTES = 2_100_000;

const FILES = [
    'Alabama.jpg', 'Alaska.jpg', 'Arizona.jpg', 'Arkansas.jpg', 'Colorado.jpg', 'Connecticut.jpg',
    'Delaware.jpg', 'Hawaii.jpg', 'Idaho.jpg', 'Illinois.jpg', 'Indiana.jpg', 'Iowa.jpg', 'Kansas.jpg',
    'Kentucky.jpg', 'Louisiana.jpg', 'Maine.jpg', 'Maryland.jpg', 'Massachusetts.jpg', 'Michigan.jpg',
    'Minnesota.jpg', 'Mississippi.jpg', 'Missouri.jpg', 'Montana.jpg', 'Nebraska.jpg', 'Nevada.jpg',
    'New-Hampshire.jpg', 'New-Jersey.jpg', 'New-Mexico.jpg', 'North-Carolina.jpg', 'North-Dakota.jpg',
    'Ohio.jpg', 'Oklahoma.jpg', 'Oregon.jpg', 'Pennsylvania.jpg', 'Rhode-Island.jpg', 'South-Carolina.jpg',
    'South-Dakota.jpg', 'Tennessee.jpg', 'Texas.jpg', 'Utah.jpg', 'Vermont.jpg', 'Washington.jpg',
    'West-Virginia.jpg', 'Wisconsin.jpg', 'Wyoming.jpg', 'District-of-Columbia.jpg',
    'Canada.jpg', 'Mexico.jpg', 'Belize.jpg', 'Costa-Rica.jpg', 'El-Salvador.jpg', 'Guatemala.jpg',
    'Honduras.jpg', 'Nicaragua.jpg', 'Panama.jpg', 'Bahamas.jpg', 'Barbados.jpg', 'Cuba.jpg',
    'Dominican-Republic.jpg', 'Haiti.jpg', 'Jamaica.jpg', 'Puerto-Rico.jpg', 'Trinidad-and-Tobago.jpg',
    'Argentina.jpg', 'Bolivia.jpg', 'Brazil.jpg', 'Chile.jpg', 'Colombia.jpg', 'Ecuador.jpg',
    'French-Guiana.jpg', 'Guyana.jpg', 'Paraguay.jpg', 'Peru.jpg', 'Suriname.jpg', 'Uruguay.jpg', 'Venezuela.jpg',
    'Indonesia.jpg', 'Philippines.jpg', 'South-Korea.jpg', 'Thailand.jpg', 'Vietnam.jpg',
];

function loadEnv() {
    const p = join(ROOT, '.env');
    if (!existsSync(p)) return;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
    }
}

function searchQuery(basename) {
    const name = basename.replace(/\.jpg$/i, '').replace(/-/g, ' ');
    const usStates = new Set([
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'Colorado', 'Connecticut', 'Delaware', 'Hawaii',
        'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
        'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
        'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'North Carolina', 'North Dakota', 'Ohio',
        'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    ]);
    if (name === 'District of Columbia') return 'Washington DC USA skyline';
    if (usStates.has(name)) return `${name} USA travel landscape`;
    if (name === 'Georgia') return 'Georgia country landscape';
    if (name === 'Washington') return 'Washington state USA landscape';
    return `${name} travel landscape`;
}

function unsplashSearchQuery(basename) {
    return searchQuery(basename).replace(/ USA travel landscape/g, '').replace(/ travel landscape/g, '');
}

async function fetchJson(url, headers = {}) {
    const res = await fetch(url, { headers, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
}

async function downloadBytes(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

async function fromUnsplash(basename, key) {
    const q = encodeURIComponent(unsplashSearchQuery(basename));
    const data = await fetchJson(
        `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&content_filter=high`,
        { Authorization: `Client-ID ${key}` },
    );
    const photo = data.results?.[0];
    if (!photo?.urls?.regular) throw new Error('No Unsplash result');
    const dl = photo.links?.download_location;
    if (dl) {
        await fetch(`${dl}?client_id=${key}`, { method: 'GET' }).catch(() => {});
    }
    return downloadBytes(photo.urls.regular);
}

async function fromWikimedia(query) {
    const q = encodeURIComponent(`${query} -logo -map -flag -svg`);
    const data = await fetchJson(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|mime&iiurlwidth=1920`,
    );
    const pages = data.query?.pages ? Object.values(data.query.pages) : [];
    for (const page of pages) {
        const info = page.imageinfo?.[0];
        const mime = info?.mime || '';
        if (!info?.url || !mime.startsWith('image/')) continue;
        if (mime.includes('svg')) continue;
        const url = info.thumburl || info.url;
        return downloadBytes(url);
    }
    throw new Error('No Wikimedia image');
}

function compressInPlace(destPath) {
    const tmp = `${destPath}.compress.jpg`;
    for (const quality of [85, 78, 70, 62, 54]) {
        const r = spawnSync(
            'sips',
            [
                '-s', 'format', 'jpeg',
                '-s', 'formatOptions', String(quality),
                '-Z', String(MAX_EDGE),
                destPath,
                '--out', tmp,
            ],
            { encoding: 'utf8' },
        );
        if (r.status !== 0) throw new Error(r.stderr || 'sips failed');
        const stat = readFileSync(tmp);
        writeFileSync(destPath, stat);
        if (stat.length <= TARGET_MAX_BYTES) {
            unlinkSync(tmp);
            return stat.length;
        }
    }
    if (existsSync(tmp)) unlinkSync(tmp);
    return readFileSync(destPath).length;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    loadEnv();
    const onlyArg = process.argv.find((a) => a.startsWith('--only'));
    const only = onlyArg
        ? new Set(onlyArg.replace('--only', '').replace(/^=/, '').split(',').map((s) => s.trim()))
        : null;

    const unsplashKey = (process.env.UNSPLASH_ACCESS_KEY || '').trim();
    const source = unsplashKey ? 'unsplash' : 'wikimedia';
    console.log(`Source: ${source}${unsplashKey ? '' : ' (set UNSPLASH_ACCESS_KEY in .env for Unsplash)'}`);

    const targets = FILES.filter((f) => !only || only.has(f));
    let ok = 0;
    let fail = 0;

    for (const file of targets) {
        const dest = join(PHOTO_DIR, file);
        const query = searchQuery(file);
        process.stdout.write(`${file} (${query})... `);
        try {
            const bytes = unsplashKey
                ? await fromUnsplash(file, unsplashKey)
                : await fromWikimedia(query);
            writeFileSync(dest, bytes);
            const size = compressInPlace(dest);
            console.log(`ok ${Math.round(size / 1024)}KB`);
            ok += 1;
            await sleep(unsplashKey ? 1200 : 350);
        } catch (e) {
            console.log(`FAIL: ${e.message}`);
            fail += 1;
        }
    }

    console.log(`Done: ${ok} ok, ${fail} failed`);
    if (unsplashKey && ok + fail > 45) {
        console.log('Note: Unsplash demo apps are rate-limited (~50 req/h). Re-run later for failures.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
