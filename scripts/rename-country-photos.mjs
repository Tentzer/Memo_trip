#!/usr/bin/env node
import { rename, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../assets/country-photos');
const renames = [
  ['New York.jpg', 'New-York.jpg'],
  ['United Kingdom.jpg', 'United-Kingdom.jpg'],
  ['Czech Republic.jpg', 'Czech-Republic.jpg'],
  ['San Marino.jpg', 'San-Marino.jpg'],
  ['Vatican City.jpg', 'Vatican-City.jpg'],
];

for (const [from, to] of renames) {
  try {
    await rename(join(dir, from), join(dir, to));
    console.log(`renamed ${from} -> ${to}`);
  } catch (e) {
    if (e.code === 'ENOENT') console.log(`skip ${from} (${e.code})`);
    else throw e;
  }
}
console.log('files:', (await readdir(dir)).filter((f) => f.includes('-') || f.includes(' ')).join(', '));
