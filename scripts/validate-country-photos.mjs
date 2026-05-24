#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = new URL('../assets/country-photos', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();

for (const name of files) {
  const buf = await readFile(join(dir.pathname, name));
  const kb = (buf.length / 1024).toFixed(0);
  const soi = buf[0] === 0xff && buf[1] === 0xd8;
  const eoi = buf.length >= 2 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
  console.log(`${name}\t${kb}KB\tSOI=${soi}\tEOI=${eoi}`);
}
