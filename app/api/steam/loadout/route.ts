import { NextResponse, NextRequest } from 'next/server';
import { getItemSuggestionGemini, getCraftSuggestionGemini, getItemSuggestionCohere, getCraftSuggestionCohere } from './getSuggestion';
import { getSuggestionItemInfo, ItemData } from './getItemData';
import { getSuggestionCraftInfo } from './getCraftData';

export interface ResponseDataItem {
    id: string,
    name: string;
    wear_name: string;
    description: string;
}

export interface ResponseDataSticker {
    id: string,
    name: string;
    description: string;
}

async function processItemJsonData(items: ResponseDataItem[]): Promise<ItemData[]> {
    const results: ItemData[] = [];

    // Loop through each item in skins_data.json
    for (const item of items) {
        const result = await getSuggestionItemInfo(item);
        // console.log(result);
        if (result) {
            results.push(result);
        }
    }

    return results;
}

async function processStickerJsonData(stickers: ResponseDataSticker[], item: ItemData): Promise<ItemData[]> {
    const results: any[] = [];

    for (const sticker of stickers) {
        const result = await getSuggestionCraftInfo(sticker, item as any);
        // console.log(result);
        if (result) {
            results.push(result);
        }
    }

    console.log(results)

    return results;
}


export async function POST(request: NextRequest) {
    try {
        const data = await request.json();
        if (data.type === "items") {
            const items = data.data;
            const results = await getItemSuggestionCohere(items);
            const inventory = await processItemJsonData(results);
            return NextResponse.json(inventory);
        } else {
            const item = data.data.item;
            const exclude: string[] = data.data.exclude ?? [];
            const results = await getCraftSuggestionCohere(item, exclude);
            const inventory = await processStickerJsonData(results, item);
            return NextResponse.json(inventory);
        }
    } catch (error) {
        console.error("Error retrieving inventory:", error);
        return NextResponse.json({ error: "Failed to get suggestion" }, { status: 500 });
    }
}