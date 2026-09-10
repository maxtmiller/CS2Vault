import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getQRSession } from "@/lib/qr-state";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("steam_session");
    cookieStore.delete("steam_refresh");

    const session = getQRSession();
    if (session) {
      try {
        if (typeof session.endSession === "function") {
          await session.endSession();
        }
        if (session.accessToken) session.accessToken = null;
        if (session.refreshToken) session.refreshToken = null;
      } catch (error) {
        console.error("Error ending session:", error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error during logout:", error);
    return NextResponse.json(
      { success: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}
