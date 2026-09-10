import fs from "fs"
import path from "path"
import { ItemData, SkinData } from "@/types/raw-item"
import { PriceData } from "@/types/price"


let itemDataCache: ItemData | null = null
let priceDataCache: PriceData | null = null
let skinDataCache: SkinData | null = null


export function loadDataFromBackup<T>(filename: string): T {
  try {
    const filePath = path.join(process.cwd(), "public", "backup", filename)
    const fileContents = fs.readFileSync(filePath, "utf8")
    return JSON.parse(fileContents) as T
  } catch (error) {
    console.error(`Error loading ${filename}:`, error)
    return {} as T
  }
}


export function getItemDataBackup(): ItemData {
  if (!itemDataCache) {
    itemDataCache = loadDataFromBackup<ItemData>("item_data.json")
  }
  return itemDataCache
}

export function getPriceDataBackup(): PriceData {
  if (!priceDataCache) {
    priceDataCache = loadDataFromBackup<PriceData>("price_data.json")
  }
  return priceDataCache
}

export function getSkinDataBackup(): SkinData {
  if (!skinDataCache) {
    skinDataCache = loadDataFromBackup<SkinData>("skins_data.json")
  }
  return skinDataCache
}

async function loadDataFromURL<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch data from ${url}: ${response.statusText}`);
  }
  return response.json();
}


export async function getItemDataURL(): Promise<ItemData> {
  if (!itemDataCache) {
    itemDataCache = await loadDataFromURL<ItemData>("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json");
  }
  return itemDataCache;
}

export async function getPriceDataURL(): Promise<PriceData> {
  if (!priceDataCache) {
    priceDataCache = await loadDataFromURL<PriceData>("https://raw.githubusercontent.com/ByMykel/counter-strike-price-tracker/main/static/prices/latest.json");
  }
  return priceDataCache;
}

export async function getSkinDataURL(): Promise<SkinData> {
  if (!skinDataCache) {
    skinDataCache = await loadDataFromURL<SkinData>("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json");
  }
  return skinDataCache;
}


let full_item_data: ItemData;
let full_price_data: PriceData;
let full_skin_data: SkinData;


async function fetchURLData() {
  [full_item_data, full_price_data, full_skin_data] = await Promise.all([
      getItemDataURL(),
      // getPriceDataURL(),
      getPriceDataBackup(),
      getSkinDataURL(),
  ]);
}  

async function fetchBackupData() {
  [full_item_data, full_price_data, full_skin_data] = await Promise.all([
      getItemDataBackup(),
      getPriceDataBackup(),
      getSkinDataBackup(),
  ]);
}


export function getFullItemData() {
  return full_item_data;
}

export function getFullPriceData() {
  return full_price_data;
}

export function getFullSkinData() {
  return full_skin_data;
}


export async function fetchData() {
  if (full_item_data && full_price_data && full_skin_data) return;
  try {
    await fetchBackupData();
  } catch (error) {
    console.error("Error fetching backup data.", error);
    return [];
  }
}
