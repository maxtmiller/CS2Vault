import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { InventoryItem } from "@/lib/steam-api"


export async function fetchInventoryFromJSON(steamId: string): Promise<InventoryItem[]> {
  console.log("Fetching inventory data from json...");

  try {
    const response = await fetch(`/api/steam/fetch-inventory?steamid=${steamId}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return [];
  }
}

export async function fetchAllInventoryData(authData: string, loginType: number): Promise<any | null> {
  console.log("Fetching private inventory data from steam client...");

  try {
    // For QR logins (loginType 1), the refresh token is read server-side from the encrypted cookie.
    // Never send it from the client.
    const body = loginType === 1
      ? JSON.stringify({ loginType })
      : JSON.stringify({ authData, loginType });

    const response = await fetch("/api/steam/inventory/jwt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const reponse = await response.json()
    const data = reponse.result;

    if (!data.success) {
      console.log(data);
      throw new Error(data?.details || "API Error: inventory fetch failed");
    }

    const storage_units = data.storage_units.length
    const item_data = JSON.parse(data.item_data)

    return { success: true, type: "jwt", item_data, storage_units, error: null }
  } catch (error: unknown | any) {
    console.log("Error fetching inventory:", error.message);
    return { success: false, type: "jwt", item_data: [], storage_units: 0, error: error?.message};
  }
}


export async function fetchVisibleInventoryData(steamId: string): Promise<any | null> {
  console.log("Fetching public inventory data...");

  try {
    const response = await fetch(`/api/steam/inventory/steam?steamid=${steamId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const reponse = await response.json()
    const data = reponse.result;

    if (!data.success) {
      console.log(data);
      throw new Error(data?.details || "API Error: inventory fetch failed");
    }

    const storage_units = data.storage_units.length
    const item_data = JSON.parse(data.item_data)

    return { success: true, type: "steam", item_data: item_data, storage_units: storage_units, error: null }
  } catch (error: unknown | any) {
    console.log("Error fetching inventory:", error)
    return { success: false, type: "steam", item_data: [], storage_units: 0, error: error?.message };
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
