import { fetchAllInventoryData, fetchVisibleInventoryData} from '@/lib/utils';

export interface InventoryItem {
  // Common fields for all items
  id: string
  def_index: number
  account_id: number
  inventory?: number | null
  quantity: number
  quality: number
  custom_name: string | null
  rarity: number
  rarity_name: string
  location: string
  name: string
  icon_url: string
  steam_price: number | null
  steam: string | null
  csfloat: string | null

  // Fields for skins
  paint_index?: number
  paint_seed?: number
  paint_wear?: number
  wear_name?: string
  is_stattrak?: boolean
  is_souvenir?: boolean

  // Fields for stickers
  sticker_id?: number
  type?: string

  // Computed fields for UI
  imageUrl?: string
  float_price?: number | null

  // Legacy fields for compatibility (can be removed later)
  category?: string
  tradable_after?: string | null
  stickers?: Object | null
  sttattrak_count?: number | null
  storageUnit?: string | null
  casket_id?: string | null
  inspect_link?: string | null
  reason?: string | null
  is_tradable?: boolean
}

export interface Sticker {
  name: string;
  image: string;
  steam_price?: number;
  sticker_id?: number;
}

const VERSION = "1.0.6"

export async function fetchInventory(steamId: string): Promise<{ success: Boolean, type: string, item_data: InventoryItem[], storage_units: number, error: string | null }> {
  console.log(`Fetching inventory for Steam ID: ${steamId}`)

  let skip = false

  // Check if we have cached inventory data
  const cachedData = localStorage.getItem("inventory_data")
  if (cachedData) {
    const parsedInventoryData = JSON.parse(cachedData)
    const data = JSON.parse(parsedInventoryData.data)
    const timestamp = parsedInventoryData.expiresAt
    const cachedVersion = parsedInventoryData.version
    if (Date.now() > timestamp || cachedVersion !== VERSION) {
      const loginData = localStorage.getItem("login_type")
      if (loginData) {
        const parsedLoginData = JSON.parse(loginData)
        const loginTimestamp = parsedLoginData.expiresAt
        const loginType = parsedLoginData.type
        if (Date.now() < loginTimestamp && loginType === "qr") {
          skip = true
        } else {
          localStorage.removeItem("login_type")
        }
      }
      if (!skip) {
        return { success: false, type: "any", item_data: [], storage_units: 0, error: "Cached inventory data expired. Please login again."}
      }
    }
    if (!skip) {
      return { success: parsedInventoryData.success, type: "any", item_data: data, storage_units: parsedInventoryData.storage_units, error: parsedInventoryData.error }
    }
  }

  const jwt = JSON.parse(localStorage.getItem("login_type") || "{}")?.authData

  return refreshInventory(steamId, jwt)
}

export async function refreshInventory(steamId: string, jwt: string): Promise<{ success: Boolean, type: string, item_data: InventoryItem[], storage_units: number, error: string | null }> {
  console.log(`Rereshing inventory data for Steam ID: ${steamId}`)

  try {
    const loginInfo = localStorage.getItem("login_type")
    if (loginInfo === null) {
      const err = new Error("Failed to fetch inventory");
      (err as any).data = `Login error: No login type found`;
      throw err;
    }

    const parsedLoginInfo = JSON.parse(loginInfo)
    const type = parsedLoginInfo.type

    let response;
    if (type === "jwt" || type === "qr") {
      const loginType = parsedLoginInfo.loginType
      response = await fetchAllInventoryData(jwt, loginType)
    }  else if (type === "steam") {
      response = await fetchVisibleInventoryData(steamId)
    } else {
      const err = new Error("Failed to fetch inventory");
      (err as any).data = `Login error: Invalid login type`;
      throw err;
    }

    if (!response || !response.success) {
      const err = new Error("Failed to fetch inventory");
      (err as any).data = response.error;
      throw err;
    }
    localStorage.setItem(
      "inventory_data",
      JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        success: response.success,
        version: VERSION,
        data: JSON.stringify(response.item_data),
        storage_units: response.storage_units,
        error: response.error,
      }),
    )
    localStorage.setItem(
      "login_type",
      JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 7 * 60 * 60 * 1000,
        type: parsedLoginInfo.type,
        loginType: parsedLoginInfo.loginType,
        authData: parsedLoginInfo.type === "jwt" ? jwt : "",
      }),
    )
    return response
  } catch (error: Error | any) {
    console.log(error);
    const error_details = (error as any).data;
    return { success: false, type: "any", item_data: [], storage_units: 0, error: error_details }
  }
}
