import { type NextRequest, NextResponse } from "next/server"
import 'lzma';
import { getRefreshToken } from "@/lib/session";

const globalAny = global as any;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { loginType } = body

    // Prevent concurrent GC connections — return 429 if one is already in progress
    if (globalAny.__gcConnectionInProgress) {
      return NextResponse.json({ result: { success: false, details: "Inventory fetch already in progress. Please wait.", item_data: [], storage_units: [] } });
    }
    globalAny.__gcConnectionInProgress = true;

    const { initializeCSGOInventory } = await import("./generateItemData");

    try {
      if (loginType === 1) {
        // QR flow — read refresh token from server-side encrypted cookie, never from client
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          return NextResponse.json({ result: { success: false, details: "Session expired. Please login again.", item_data: [], storage_units: [] } });
        }
        const result = await initializeCSGOInventory({ refreshToken }, loginType);
        return NextResponse.json({ result });
      } else {
        // JWT flow
        const { authData } = body;
        const auth = JSON.parse(authData);
        const result = await initializeCSGOInventory(auth, loginType);
        return NextResponse.json({ result });
      }
    } finally {
      globalAny.__gcConnectionInProgress = false;
    }
  } catch (error) {
    globalAny.__gcConnectionInProgress = false;
    console.error("Error retrieving inventory:", error)
    return NextResponse.json({ result: error })
  }
}
