import fs from 'fs';
import path from 'path';
import protobuf from 'protobufjs';
import CRC32 from 'crc-32';
import type { ResponseDataItem } from './route'
import { fetchData, getFullItemData, getFullPriceData, getFullSkinData } from "@/lib/data-loader"
import { SkinData } from "@/types/raw-item"
import { PriceData } from "@/types/price"


interface FloatRange {
    min: number;
    max: number;
}

interface Rarity {
    name: string;
    num: number;
}

export interface ItemData {
    id: string,
    def_index: number;
    name: string;
    paint_index: number;
    paint_seed: number;
    paint_wear: number;
    wear_name: string;
    rarity: number;
    rarity_name: string;
    category: string;
    type: string;
    custom_name: null;
    is_souvenir: boolean;
    is_stattrak: boolean;
    icon_url: string;
    csfloat: string;
    steam: string;
    inspect_link: string | null;
    steam_price: number | null;
    stickers?: string | null;
    reason: string | null
}

interface Sticker {
    sticker_id: number;
    offsetX?: number;
    offsetY?: number;
    rotation?: number;
}


let full_price_data: PriceData;
let full_skin_data: SkinData;


async function generateInspectLinkFromObject(props: ItemData): Promise<string | null> {
    const previewLink = "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20";

    function floatToBytes(floatValue: number): number {
        const floatArray = new Float32Array(1);
        floatArray[0] = floatValue;
        const byteArray = new Uint32Array(floatArray.buffer);
        return byteArray[0];
    }

    async function generateHex(props: ItemData): Promise<string> {
        // const stickers: Sticker[] = props.stickers || [];

        const econ = {
            defindex: props.def_index,
            paintindex: props.paint_index,
            paintseed: props.paint_seed,
            rarity: props.rarity,
            paintwear: floatToBytes(props.paint_wear),
            customname: props.custom_name || "",
            stickers: []
            // stickers: stickers.map(sticker => ({
            //     ...sticker,
            //     stickerId: sticker.sticker_id,
            //     rotation: sticker.rotation === undefined ? 0 : sticker.rotation,
            // })),
        };

        const filePath = path.join(process.cwd(), 'public/econ.proto');
        const root = await protobuf.load(filePath);
        const CEconItemPreviewDataBlock = root.lookupType('CEconItemPreviewDataBlock');

        const errMsg = CEconItemPreviewDataBlock.verify(econ);
        if (errMsg) throw new Error(errMsg);

        let payload = CEconItemPreviewDataBlock.encode(econ).finish();

        payload = Buffer.concat([Uint8Array.from([0]), payload]);

        let crc = CRC32.buf(payload);

        const x_crc = (crc & 0xffff) ^ (CEconItemPreviewDataBlock.encode(econ).finish().length * crc);

        const crcBuffer = Buffer.alloc(4);
        crcBuffer.writeUInt32BE((x_crc & 0xffffffff) >>> 0, 0);

        const buffer = Buffer.concat([payload, crcBuffer]);

        return buffer.toString("hex").toUpperCase();
    }

    const hex = await generateHex(props);

    return `${previewLink}${hex}`;
}

function getFloatRange(wear_name: string): FloatRange | null {
    const floatRanges: { min: number; max: number; name: string }[] = [
        { min: 0.01, max: 0.07, name: 'Factory New' },
        { min: 0.07, max: 0.15, name: 'Minimal Wear' },
        { min: 0.15, max: 0.38, name: 'Field-Tested' },
        { min: 0.38, max: 0.45, name: 'Well-Worn' },
        { min: 0.45, max: 1.00, name: 'Battle-Scarred' }
    ];

    for (const range of floatRanges) {
        if (wear_name === range.name) {
            return { min: range.min, max: range.max };
        }
    }
    return null;
}

function getRarityNum(rarity_name: string): number | null {
    const rarity_names: Rarity[] = [
        { name: "Stock Grade", num: 0 },
        { name: "Consumer Grade", num: 1 },
        { name: "Industrial Grade", num: 2 },
        { name: "Mil-Spec Grade", num: 3 },
        { name: "Restricted", num: 4 },
        { name: "Classified", num: 5 },
        { name: "Covert", num: 6 },
        { name: "Contraband", num: 7 },
        { name: "Extraordinary", num: 99 },
        { name: "Gold", num: 99 },
    ];

    for (const rarity of rarity_names) {
        if (rarity_name === rarity.name) {
            return rarity.num;
        }
    }
    return null;
}

export async function getSuggestionItemInfo(
    items: ResponseDataItem,
): Promise<ItemData | null> {

    await fetchData();

    full_price_data = getFullPriceData()
    full_skin_data = getFullSkinData()

    const item = Object.values(full_skin_data).find(item => item.name === items.name);

    console.log(`[getItemData] looking up: "${items.name}" → found: ${!!item}`);
    if (!item) {
        // Try case-insensitive match to diagnose naming mismatches
        const closeMatch = Object.values(full_skin_data).find(i => i.name.toLowerCase() === items.name.toLowerCase());
        console.log(`[getItemData] case-insensitive match: ${closeMatch ? closeMatch.name : 'none'}`);
    }

    if (!item) {
        return null;
    }

    let floatRange = getFloatRange(items.wear_name);
    const rarityNum = getRarityNum(item.rarity.name);

    if (!floatRange?.min  || rarityNum === null) {
        return null;
    }

    const title = `${items.name} (${items.wear_name})`;
    let price = full_price_data[title];

    let CSFloat = `https://csfloat.com/search?sort_by=lowest_price&category=1&min_float=${floatRange.min}&max_float=${floatRange.max}&def_index=${item.weapon.weapon_id}&paint_index=${parseInt(item.paint_index, 10)}`;

    const encodedString = encodeURIComponent(`${item.name} (${items.wear_name})`)
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
    const SteamMarket = `https://steamcommunity.com/market/listings/730/${encodedString}`;

    if (!price) {
        floatRange.min = 0.07;
        floatRange.max = 0.38;
        CSFloat = `https://csfloat.com/search?sort_by=lowest_price&category=1&min_float=${0.07}&max_float=${0.38}&def_index=${item.weapon.weapon_id}&paint_index=${parseInt(item.paint_index, 10)}`;
        price = full_price_data[`${items.name} (Minimal Wear)`];
        items.wear_name = "Minimal Wear";
    }

    const item_data: ItemData = {
        id: item.id,
        def_index: item.weapon.weapon_id,
        name: item.name,
        paint_index: parseInt(item.paint_index, 10),
        paint_seed: 500,
        paint_wear: (floatRange.max - floatRange.min) / 2,
        wear_name: items.wear_name,
        rarity: rarityNum,
        rarity_name: item.rarity.name,
        category: 'weapon',
        type: item.category.name,
        custom_name: null,
        is_souvenir: item.souvenir,
        is_stattrak: item.stattrak,
        icon_url: item.image,
        csfloat: CSFloat,
        steam: SteamMarket,
        inspect_link: null,
        steam_price: price ? price.steam.last_ever : null,
        reason: items.description,
    };

    const inspect_link = await generateInspectLinkFromObject(item_data);
    item_data.inspect_link = inspect_link;

    return item_data;
}