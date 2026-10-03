import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config({ path: '.env' });

const force = process.argv.includes('--force');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 6 });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX).namespace('items');

// Must match app/api/steam/loadout/getSuggestion.ts
const VISION_MODEL = 'gpt-5-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1024;

// Generated once per skin from its image; committed so weekly runs only describe new skins
const DESCRIPTIONS_PATH = './public/backup/skin_descriptions.json';

const SNIPERS = new Set(['AWP', 'SSG 08', 'SCAR-20', 'G3SG1']);
const MACHINE_GUNS = new Set(['M249', 'Negev']);
// Doppler gems look nothing like the regular phases, so they keep their own entries
const GEM_PHASES = new Set(['Ruby', 'Sapphire', 'Emerald', 'Black Pearl']);

// Values match the weapon type ids in components/selected-items.tsx
function skinType(skin) {
    switch (skin.category?.name) {
        case 'Pistols': return 'pistol';
        case 'SMGs': return 'smg';
        case 'Rifles': return SNIPERS.has(skin.weapon.name) ? 'sniper' : 'rifle';
        case 'Heavy': return MACHINE_GUNS.has(skin.weapon.name) ? 'machinegun' : 'shotgun';
        case 'Knives': return 'knife';
        case 'Gloves': return 'gloves';
        default: return null;
    }
}

const skinsData = JSON.parse(readFileSync('./public/backup/skins_data.json', 'utf-8'));
const seen = new Set();
const skins = [];
for (const skin of Object.values(skinsData)) {
    const type = skinType(skin);
    if (!type || !skin.image) continue;
    const gem = GEM_PHASES.has(skin.phase) ? skin.phase : null;
    const key = gem ? `${skin.name} (${gem})` : skin.name;
    if (seen.has(key)) continue;
    seen.add(key);
    skins.push({ ...skin, type, gem });
}
console.log(`Found ${skins.length} weapon, knife and glove skins.`);

const descriptions = existsSync(DESCRIPTIONS_PATH)
    ? JSON.parse(readFileSync(DESCRIPTIONS_PATH, 'utf-8'))
    : {};

if (force) {
    console.log('--force: deleting all vectors in the items namespace...');
    await index.deleteAll();
}

const existingIds = new Set();
if (!force) {
    let paginationToken = undefined;
    do {
        const listResult = await index.listPaginated({ limit: 100, paginationToken });
        for (const v of listResult.vectors ?? []) existingIds.add(v.id);
        paginationToken = listResult.pagination?.next;
    } while (paginationToken);
    console.log(`${existingIds.size} skins already indexed.`);
}

const toIndex = skins.filter(s => !existingIds.has(s.id)).slice(0, limit);
console.log(`${toIndex.length} skins to index.`);
if (toIndex.length === 0) process.exit(0);

async function describe(skin) {
    const response = await openai.chat.completions.create({
        model: VISION_MODEL,
        reasoning_effort: 'low',
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: 'This is a CS2 weapon skin. In 2-3 sentences describe only how it looks, for colour matching: the dominant and accent colours (name them concretely), the finish (e.g. anodized, metallic, matte, glossy, hydrographic), the pattern, and the overall style or theme. Do not name the weapon or the skin.',
                },
                { type: 'image_url', image_url: { url: skin.image, detail: 'low' } },
            ],
        }],
    });
    const text = response.choices[0].message.content?.trim();
    if (!text) throw new Error(`Empty description for ${skin.name}`);
    return text;
}

const needDescription = toIndex.filter(s => !descriptions[s.id]);
console.log(`${needDescription.length} skins need a visual description.`);

const CONCURRENCY = 8;
let described = 0;
let failed = 0;
async function worker(queue) {
    for (let skin = queue.shift(); skin; skin = queue.shift()) {
        try {
            descriptions[skin.id] = await describe(skin);
        } catch (error) {
            failed += 1;
            console.error(`Failed to describe ${skin.name}: ${error.message}`);
        }
        described += 1;
        if (described % 50 === 0) {
            writeFileSync(DESCRIPTIONS_PATH, JSON.stringify(descriptions, null, 1));
            console.log(`Described ${described} / ${needDescription.length}`);
        }
    }
}
const queue = [...needDescription];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
writeFileSync(DESCRIPTIONS_PATH, JSON.stringify(descriptions, null, 1));
if (failed) console.log(`${failed} descriptions failed; those skins are skipped and retried next run.`);

const ready = toIndex.filter(s => descriptions[s.id]);
const BATCH_SIZE = 96;
for (let i = 0; i < ready.length; i += BATCH_SIZE) {
    const batch = ready.slice(i, i + BATCH_SIZE);
    const embedResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: batch.map(s => descriptions[s.id]),
    });

    await index.upsert(batch.map((s, j) => ({
        id: s.id,
        values: embedResponse.data[j].embedding,
        metadata: {
            name: s.name,
            type: s.type,
            weapon: s.weapon.name,
            rarity: s.rarity?.name ?? '',
            description: descriptions[s.id],
            ...(s.gem && { phase: s.gem }),
        },
    })));
    console.log(`Upserted ${Math.min(i + BATCH_SIZE, ready.length)} / ${ready.length}`);
}

console.log('Done!');
