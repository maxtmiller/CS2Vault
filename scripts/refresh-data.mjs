import { writeFileSync } from 'fs';
import { join } from 'path';

const FILES = [
    {
        url: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json',
        dest: 'public/backup/item_data.json',
    },
    {
        url: 'https://raw.githubusercontent.com/ByMykel/counter-strike-price-tracker/main/static/prices/latest.json',
        dest: 'public/backup/price_data.json',
    },
    {
        url: 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',
        dest: 'public/backup/skins_data.json',
    },
];

for (const { url, dest } of FILES) {
    console.log(`Fetching ${dest}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    const text = await res.text();
    writeFileSync(join(process.cwd(), dest), text, 'utf-8');
    console.log(`Saved ${dest} (${(text.length / 1024 / 1024).toFixed(1)} MB)`);
}

console.log('Done.');
