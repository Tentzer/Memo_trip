#!/usr/bin/env node
/** Re-encode all assets/country-photos/*.jpg: max 1600px, target <= 2 MB (macOS sips). */
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { readdir, rename, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PHOTO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets/country-photos');
const MAX_EDGE = 1600;
const MAX_BYTES = 2_100_000;

function compressOne(inputPath) {
    const tmp = `${inputPath}.work.jpg`;
    if (existsSync(tmp)) unlinkSync(tmp);

    let finalQuality = 48;
    let finalSize = 0;

    for (let quality = 85; quality >= 48; quality -= 5) {
        if (existsSync(tmp)) unlinkSync(tmp);

        const r = spawnSync(
            'sips',
            [
                '-s', 'format', 'jpeg',
                '-s', 'formatOptions', String(quality),
                '-Z', String(MAX_EDGE),
                inputPath,
                '--out', tmp,
            ],
            { encoding: 'utf8' },
        );
        if (r.status !== 0) {
            throw new Error(r.stderr?.trim() || `sips failed (exit ${r.status})`);
        }
        if (!existsSync(tmp)) {
            throw new Error('sips did not create output file');
        }

        finalSize = statSync(tmp).size;
        finalQuality = quality;
        if (finalSize <= MAX_BYTES) break;
    }

    return { tmp, size: finalSize, quality: finalQuality };
}

async function main() {
    const files = (await readdir(PHOTO_DIR))
        .filter((f) => f.toLowerCase().endsWith('.jpg'))
        .sort();

    let totalBefore = 0;
    let totalAfter = 0;
    let failed = 0;

    for (const name of files) {
        const path = join(PHOTO_DIR, name);
        try {
            const before = (await stat(path)).size;
            const { tmp, size, quality } = compressOne(path);
            await rename(tmp, path);
            totalBefore += before;
            totalAfter += size;
            const beforeKb = Math.round(before / 1024);
            const afterKb = Math.round(size / 1024);
            if (beforeKb !== afterKb) {
                console.log(`${name}: ${beforeKb}KB -> ${afterKb}KB (q=${quality})`);
            }
        } catch (err) {
            failed += 1;
            console.error(`${name}: FAIL ${err.message}`);
            const work = `${path}.work.jpg`;
            if (existsSync(work)) unlinkSync(work);
        }
    }

    console.log(
        `Done. ${files.length} files, ${failed} failed. `
        + `${Math.round(totalBefore / 1024 / 1024)}MB -> ${Math.round(totalAfter / 1024 / 1024)}MB`,
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
