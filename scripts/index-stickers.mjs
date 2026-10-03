import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config({ path: '.env' });

const force = process.argv.includes('--force');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Must match app/api/steam/loadout/getSuggestion.ts
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1024;
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX).namespace('stickers');

const itemData = JSON.parse(readFileSync('./public/backup/item_data.json', 'utf-8'));
const stickers = Object.values(itemData).filter(i => i.name?.startsWith('Sticker |'));

console.log(`Found ${stickers.length} stickers in item data.`);

if (force) {
    console.log('--force: deleting all vectors from Pinecone...');
    await index.deleteAll();
    console.log('Deleted all vectors.');
}

// Fetch existing IDs to skip already-indexed stickers (skipped when --force)
const existingIds = new Set();
if (!force) {
    let paginationToken = undefined;
    do {
        const listResult = await index.listPaginated({ limit: 100, paginationToken });
        for (const v of listResult.vectors ?? []) existingIds.add(v.id);
        paginationToken = listResult.pagination?.next;
    } while (paginationToken);
    console.log(`${existingIds.size} stickers already indexed in Pinecone.`);
}

const newStickers = force ? stickers : stickers.filter(s => !existingIds.has(s.id ?? ''));
console.log(`${newStickers.length} stickers to index.`);

if (newStickers.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
}

const BATCH_SIZE = 96;

for (let i = 0; i < newStickers.length; i += BATCH_SIZE) {
    const batch = newStickers.slice(i, i + BATCH_SIZE);
    const texts = batch.map(s => {
        const parts = [s.name];
        if (s.type) parts.push(`Type: ${s.type}`);
        if (s.effect && s.effect !== 'Other') parts.push(`Effect: ${s.effect}`);
        if (s.tournament?.name) parts.push(`Tournament: ${s.tournament.name}`);
        if (s.team?.name) parts.push(`Team: ${s.team.name}`);
        if (s.rarity?.name && s.rarity.name !== 'Default') parts.push(`Rarity: ${s.rarity.name}`);
        if (s.crates?.[0]?.name) parts.push(`Capsule: ${s.crates[0].name}`);
        return parts.join(', ');
    });

    const embedResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: texts,
    });

    const vectors = batch.map((s, j) => ({
        id: s.id ?? `sticker-${i + j}`,
        values: embedResponse.data[j].embedding,
        metadata: { name: s.name },
    }));

    await index.upsert(vectors);
    console.log(`Upserted ${Math.min(i + BATCH_SIZE, newStickers.length)} / ${newStickers.length}`);
}

console.log('Done!');
