import { type NextRequest, NextResponse } from "next/server"
import { createSteamSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const steamId = request.nextUrl.searchParams.get("steamid")
    if (!steamId) {
      return NextResponse.redirect(new URL("/", request.url))
    }

    await createSteamSession(steamId)
    return NextResponse.redirect(new URL("/", request.url))
  } catch (error) {
    console.error("Error creating session:", error)
    return NextResponse.redirect(new URL("/", request.url))
  }
}
