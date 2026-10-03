import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
import { Pinecone } from '@pinecone-database/pinecone';
import { fetchData, getFullItemData, getFullPriceData, getFullSkinData } from "@/lib/data-loader";
import type { ResponseDataItem } from "./route";

const CHAT_MODEL = "gpt-5-mini";
// Must match scripts/index-stickers.mjs; 1024 dims fits the existing Pinecone index
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;

let openaiClient: OpenAI | null = null;

function getOpenAI() {
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiClient;
}

let pineconeIndex: ReturnType<Pinecone['index']> | null = null;

function getPineconeIndex() {
    if (!pineconeIndex) {
        const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
        pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!);
    }
    return pineconeIndex;
}

const ITEM_TYPES = ["pistol", "smg", "rifle", "sniper", "shotgun", "machinegun", "knife", "gloves"];
const SUGGESTION_COUNT = 6;
// Guns are suggested within this factor of the selected items' average price
const PRICE_RANGE_FACTOR = 3;

type SuggestionInput = {
    name: string;
    // The first request sends wear/price, "recommend more" sends raw inventory items
    wear?: string;
    wear_name?: string;
    price?: number | null;
    steam_price?: number | null;
};

// Inventory names can carry StatTrak/Souvenir and the wear, e.g. "★ StatTrak™ Karambit | Fade (Factory New)"
function baseSkinName(name: string): string {
    return name
        .replace("StatTrak™ ", "")
        .replace(/^Souvenir /, "")
        .replace(/ \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, "");
}

function averageVectors(vectors: number[][]): number[] {
    return vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length);
}

export async function getItemSuggestion(data: {
    items: SuggestionInput[];
    weapon_preferences: string[];
    exclude?: string[];
}): Promise<ResponseDataItem[]> {
    await fetchData();
    const skins = Object.values(getFullSkinData());
    const prices = getFullPriceData();
    const index = getPineconeIndex().namespace("items");

    // Skins are indexed by their skins_data.json id and agents by their item_data.json id (index-items.mjs)
    const inputNames = new Set(data.items.map((i) => baseSkinName(i.name)));
    const inputIds = [...skins, ...Object.values(getFullItemData())]
        .filter((s) => inputNames.has(s.name))
        .map((s) => s.id);
    const { records } = await index.fetch([...new Set(inputIds)]);
    const inputs = Object.values(records);
    if (inputs.length === 0) {
        throw new Error("None of the selected items are in the item index");
    }

    const inputTypes = new Set(inputs.map((r) => r.metadata?.type));
    const types = (data.weapon_preferences.includes("any") ? ITEM_TYPES : data.weapon_preferences)
        // Never suggest a second knife or pair of gloves
        .filter((t) => !((t === "knife" || t === "gloves") && inputTypes.has(t)));
    if (types.length === 0) return [];

    const { matches } = await index.query({
        vector: averageVectors(inputs.map((r) => r.values as number[])),
        topK: 100,
        includeMetadata: true,
        filter: {
            type: { $in: types },
            weapon: { $nin: [...new Set(inputs.map((r) => r.metadata?.weapon as string))] },
            ...(data.exclude?.length ? { name: { $nin: data.exclude } } : {}),
        },
    });

    // Knives and gloves are exempt from the price range, so they don't set it either
    const inputPrices = data.items
        .filter((i) => !i.name.startsWith("★"))
        .map((i) => i.price ?? i.steam_price)
        .filter((p): p is number => typeof p === "number" && p > 0);
    const averagePrice = inputPrices.length
        ? inputPrices.reduce((sum, p) => sum + p, 0) / inputPrices.length
        : null;
    const preferredWear = data.items[0].wear ?? data.items[0].wear_name;
    const skinsById = new Map(skins.map((s) => [s.id, s]));

    const candidates = matches.flatMap((m) => {
        const name = m.metadata?.name as string;
        const wears: string[] = skinsById.get(m.id)?.wears?.map((w: any) => w.name) ?? [];
        const pricedWears = wears.filter((w) => prices[`${name} (${w})`]);
        // Prefer the selected wear, but only show a wear that has a price
        const wear = [preferredWear, ...pricedWears, ...wears].find(
            (w) => w && wears.includes(w) && (pricedWears.length === 0 || pricedWears.includes(w))
        );
        if (!wear) return [];
        return {
            id: m.id,
            name,
            wear_name: wear,
            description: m.metadata?.description as string,
            type: m.metadata?.type as string,
            weapon: m.metadata?.weapon as string,
            price: prices[`${name} (${wear})`]?.steam.last_ever ?? null,
        };
    });

    // Knives and gloves are expected to cost more, so only guns are held to the price range
    const inPriceRange = (c: (typeof candidates)[number]) =>
        c.type === "knife" ||
        c.type === "gloves" ||
        averagePrice === null ||
        (c.price !== null &&
            c.price >= averagePrice / PRICE_RANGE_FACTOR &&
            c.price <= averagePrice * PRICE_RANGE_FACTOR);

    // Similarity order, preferring in-range prices. Passes: the best match of each requested type,
    // then one skin per weapon for variety, then (only when specific types were picked) more of the
    // same weapons. With "any" the result is a loadout, so it gets one knife and one pair of gloves.
    const isAny = data.weapon_preferences.includes("any");
    const slotOf = (c: (typeof candidates)[number]) =>
        isAny && (c.type === "knife" || c.type === "gloves") ? c.type : c.weapon;
    const passes = isAny ? ["type", "slot"] : ["type", "slot", "fill"];

    const ordered = [...candidates.filter(inPriceRange), ...candidates.filter((c) => !inPriceRange(c))];
    const picked: typeof candidates = [];
    const usedSlots = new Set<string>();
    const coveredTypes = new Set<string>();
    for (const pass of passes) {
        for (const c of ordered) {
            if (picked.length === SUGGESTION_COUNT) break;
            if (picked.includes(c)) continue;
            if (pass !== "fill" && usedSlots.has(slotOf(c))) continue;
            if (pass === "type" && coveredTypes.has(c.type)) continue;
            usedSlots.add(slotOf(c));
            coveredTypes.add(c.type);
            picked.push(c);
        }
    }
    picked.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));

    return picked.map(({ id, name, wear_name, description }) => ({ id, name, wear_name, description }));
}


export async function getCraftSuggestion(item: any, exclude: string[] = []): Promise<any> {
    try {
        const itemName = item.name;
        const itemWear = item.wear_name ?? item.wear;

        const queryPrompt = `I have a ${itemName} (${itemWear}) CS2 skin. Describe in 2-3 sentences the colors, style, and theme of stickers that would look great on it in a 4x craft. Focus on visual characteristics like colors, patterns, and aesthetic feel.`;
        const queryResponse = await getOpenAI().chat.completions.create({
            model: CHAT_MODEL,
            reasoning_effort: "low",
            messages: [{ role: "user", content: queryPrompt }],
        });
        const queryText = queryResponse.choices[0].message.content;
        if (!queryText) throw new Error('Failed to get sticker description');

        const embedResponse = await getOpenAI().embeddings.create({
            model: EMBEDDING_MODEL,
            dimensions: EMBEDDING_DIMENSIONS,
            input: queryText,
        });
        const queryVector = embedResponse.data[0].embedding;

        const results = await getPineconeIndex().namespace("stickers").query({
            vector: queryVector,
            topK: 5 + exclude.length,
            includeMetadata: true,
        });

        return results.matches
            .filter(m => !exclude.includes(m.metadata?.name as string))
            .slice(0, 5)
            .map((m, i) => ({
                id: String(i),
                name: m.metadata?.name as string,
                description: `Semantically matched to ${itemName} based on color and style.`,
            }));

    } catch (error: any) {
        console.error(`Error occurred: ${error.message}`);
        throw error;
    }
}
