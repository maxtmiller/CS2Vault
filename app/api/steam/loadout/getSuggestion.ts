import dotenv from "dotenv";
dotenv.config();
import { CohereClientV2 } from 'cohere-ai';
import { GoogleGenAI } from "@google/genai";
import { Pinecone } from '@pinecone-database/pinecone';

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX!);

const KNIFE_TOKENS = ['Knife', 'Karambit', 'Bayonet', 'Dagger', 'Sword', 'Ursus', 'Navaja', 'Stiletto', 'Talon', 'Gut ', 'Flip', 'Falchion', 'Shadow', 'Bowie', 'Huntsman', 'Butterfly', 'Paracord', 'Survival', 'Nomad', 'Skeleton', 'Classic'];
const GLOVE_TOKENS = ['Gloves', 'Wraps', 'Hand Wraps'];

function buildExclusionClause(items: any[]): string {
    const inputNames = items.map((i: any) => i.name.split('|')[0].trim());
    const hasKnife = inputNames.some((n: string) => KNIFE_TOKENS.some(t => n.includes(t)));
    const hasGlove = inputNames.some((n: string) => GLOVE_TOKENS.some(t => n.includes(t)));

    const excluded: string[] = [];
    if (hasKnife) excluded.push('knives (any knife type — Karambit, Butterfly, M9 Bayonet, Flip Knife, etc.)');
    if (hasGlove) excluded.push('gloves (any glove type — Sport Gloves, Moto Gloves, Hand Wraps, etc.)');

    let clause = '';
    if (excluded.length > 0) {
        clause += ` STRICT RULE: Do NOT suggest any ${excluded.join(' or ')} — the user already has one.`;
    }
    clause += ` Do NOT suggest the same weapon as any input item. Input items: ${inputNames.join(', ')}.`;
    return clause;
}


export async function getItemSuggestionCohere(data: { items: any[], weapon_preferences: any[]}): Promise<any> {

    try {
        let prompt = `
            ## User Message
            I have the following items: 
        `;
        for (const item of data.items) {
            const cur = ` a ${item.name} in ${item.wear} that costs $${item.price} with image ${item.image},`
            prompt += cur;
        }
        prompt += "suggest at least 4 items that fit with my loadout with the same colours and a similar price."

        prompt += "I want suggestions for the following item types only: "
        for (const item of data.weapon_preferences) {
            prompt += ' '+item;
        }

        prompt += buildExclusionClause(data.items);

        console.log(prompt)

        const systemMessage = `
            ## Task and Context
            You are a specialist in Valve's game CS2 and you will suggest items for the user that have very similar colours to the items provided.
            DO NOT provide an item that the user inputted. Do NOT suggest any knife if the user already has a knife. Do NOT suggest any glove if the user already has a glove.
            Provide as many items as needed to complete their loadout with the main guns if they input any. That is, provide AT LEAST 3 items.
            Only provide the item types requested by the user, do not provide any other item types.
            Give items in the same price range as the ones inputted, DO NOT provide an item that is much more expensive unless it is a knife or glove.
            DO NOT include the wear in the item name, do not suggest stattrak items.
            For knives and gloves, remember the names have a star in front, like "★ Karambit | Fade" and "★ Moto Gloves | Spearmint"
            Do not include doppler phases in the name or any other specific details, like souvenir or stattrak just the name of the item.

            ## Style Guide
            Respond with a JSON object containing a single key "items" whose value is an array. Each element must have:
            {
                id: (a string starting from 0, unique for each one)
                name: (the market hash name of the item, ie. USP-S | Printstream)
                wear_name: (the wear_name of the item, ie. Factory New)
                description: (why you think this is a good fit)
            }
        `;

        const messages = [{ role: "system", content: systemMessage }, { role: "user", content: prompt }] as any;

        const response = await cohere.chat({
            model: 'command-a-plus-05-2026',
            messages,
            responseFormat: {
                type: "json_object",
                jsonSchema: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    name: { type: "string" },
                                    wear_name: { type: "string" },
                                    description: { type: "string" },
                                },
                                required: ["id", "name", "wear_name", "description"],
                            },
                        },
                    },
                    required: ["items"],
                },
            },
        } as any);

        let responseText = "";
        if (response.message?.content) {
            for (const block of response.message.content) {
                if (block.type === "text") {
                    responseText = block.text;
                    break;
                }
            }
        }
        const parsed = JSON.parse(responseText);
        const parsedResponse = parsed.items ?? parsed;

        return parsedResponse;
    } catch (error: any) {
        console.error(`Error occurred: ${error.message}`);
        throw error;
    }
}


export async function getItemSuggestionGemini(data: { items: any[], weapon_preferences: any[]}): Promise<any> {

    const apiKey: string | undefined = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
    }
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    try {

        let prompt = `
            ## User Message
            I have the following items: 
        `;
        for (const item of data.items) {
            const cur = ` a ${item.name} in ${item.wear} that costs $${item.price} with image ${item.image},`
            prompt += cur;
        }
        prompt += "suggest at least 4 items that fit with my loadout with the same colours and a similar price."

        prompt += "I want suggestions for the following item types only: "
        for (const item of data.weapon_preferences) {
            prompt += ' '+item;
        }

        prompt += `. IMPORTANT: Do NOT suggest any item of the same weapon type as the input items. The input item weapon types are: ${data.items.map((i: any) => i.name.split('|')[0].trim()).join(', ')}.`

        console.log(prompt)

        const systemMessage = `
            ## Task and Context
            You are a specialist in Valve's game CS2 and you will suggest items for the user that have very similar colours to the items provided.
            DO NOT provide an item that the user inputted. Do NOT suggest any item whose base weapon name matches any of the input items' base weapon names.
            Provide as many items as needed to complete their loadout with the main guns if they input any. That is, provide AT LEAST 3 items.
            Only provide the item types requested by the user, do not provide any other item types.
            Give items in the same price range as the ones inputted, DO NOT provide an item that is much more expensive unless it is a knife or glove.
            DO NOT include the wear in the item name, do not suggest stattrak items.
            For knives and gloves, remember the names have a star in front, like "★ Karambit | Fade" and "★ Moto Gloves | Spearmint"
            Do not include doppler phases in the name or any other specific details, like souvenir or stattrak just the name of the item.

            ## Style Guide
            Respond in following the exact json specification below for each item suggested, and put all the items into an array that you will return
            {
                id: (a string starting from 0, unique for each one)
                name: (the market hash name of the item, ie. USPS | Prinstream)
                wear_name: (the wear_name of the item, ie. Factory New)
                description: (why you think this is a good fit)
            }
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: systemMessage+prompt,
        });

        let responseText = "";
        if (response.text) {
            console.log(response.text);
            responseText = response.text;
        }

        const parsedResponse = JSON.parse(responseText.replace(/```json\s*/, "").replace(/```$/, ""));

        return parsedResponse;
    } catch (error: any) {
        console.error(`Error occurred: ${error.message}`);
        throw error;
    }
}


export async function getCraftSuggestionCohere(item: any, exclude: string[] = []): Promise<any> {
    try {
        const itemName = item.name;
        const itemWear = item.wear_name ?? item.wear;

        const queryPrompt = `I have a ${itemName} (${itemWear}) CS2 skin. Describe in 2-3 sentences the colors, style, and theme of stickers that would look great on it in a 4x craft. Focus on visual characteristics like colors, patterns, and aesthetic feel.`;
        const queryResponse = await cohere.chat({
            model: 'command-a-plus-05-2026',
            messages: [{ role: "user", content: queryPrompt }] as any,
        } as any);

        let queryText = "";
        if (queryResponse.message?.content) {
            for (const block of queryResponse.message.content) {
                if (block.type === "text") { queryText = block.text; break; }
            }
        }

        const embedResponse = await cohere.embed({
            model: 'embed-english-v3.0',
            texts: [queryText],
            inputType: 'search_query',
            embeddingTypes: ['float'],
        });

        const queryVector = embedResponse.embeddings?.float?.[0];
        if (!queryVector) throw new Error('Failed to get embedding vector');

        const results = await pineconeIndex.query({
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


export async function getCraftSuggestionGemini(item: any): Promise<any> {

    const apiKey: string | undefined = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in the environment variables.");
    }
    const ai = new GoogleGenAI({ apiKey: apiKey });
    
    try {

        let prompt = `
            ## User Message
            I have the following item: a ${item.name} in ${item.wear} that costs $${item.price} with image ${item.image}.
            Suggest at least 5 different stickers that would fit well with this item in a 4x craft.
        `;

        console.log(prompt)

        const systemMessage = `
            ## Task and Context
            You are a specialist in Valve's game CS2 and you will suggest sticker crafts for the user that have very similar colours to the item provided and fit well.          

            ## Style Guide
            Respond in following the exact json specification below for each sticker suggested, and put all the stickers into an array that you will return. Do not respond with any other text.
            {
                id: (a string starting from 0, unique for each one)
                name: (the market hash name of the sticker, ie. Sticker | drop (Holo) | Antwerp 2022)
                description: (why you think this is a good fit)
            }
        `;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: systemMessage+prompt,
        });

        let responseText = "";
        if (response.text) {
            console.log(response.text);
            responseText = response.text;
        }

        const parsedResponse = JSON.parse(responseText.replace(/```json\s*/, "").replace(/```$/, ""));

        return parsedResponse;
    } catch (error: any) {
        console.error(`Error occurred: ${error.message}`);
        throw error;
    }
}
