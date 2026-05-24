#!/usr/bin/env node
/** Copy Florida.jpg as placeholder for any listed country photo that is missing. */
import { copyFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../assets/country-photos');
const seed = join(dir, 'Florida.jpg');

const files = [
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

let created = 0;
for (const name of files) {
    const dest = join(dir, name);
    try {
        await access(dest);
    } catch {
        await copyFile(seed, dest);
        created += 1;
        console.log(`placeholder: ${name}`);
    }
}
console.log(`Done. Created ${created} placeholders.`);
