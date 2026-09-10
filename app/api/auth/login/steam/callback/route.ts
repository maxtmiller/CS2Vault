import { type NextRequest, NextResponse } from "next/server"
import { createSteamSession } from "@/lib/session"

// Nonce cache to prevent duplicate verify calls within the same instance
const usedNonces = new Map<string, number>()
const NONCE_TTL_MS = 60_000

function pruneNonces() {
  const now = Date.now()
  for (const [nonce, ts] of usedNonces) {
    if (now - ts > NONCE_TTL_MS) usedNonces.delete(nonce)
  }
}

async function verifySteamOpenId(verifyParams: URLSearchParams, attempt = 0): Promise<string> {
  const res = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  })

  if (res.status === 429) {
    if (attempt >= 3) throw new Error("Steam API error: 429 Too Many Requests")
    const delay = 500 * Math.pow(2, attempt)
    await new Promise((r) => setTimeout(r, delay))
    return verifySteamOpenId(verifyParams, attempt + 1)
  }

  if (!res.ok) throw new Error(`Steam API error: ${res.status} ${res.statusText}`)
  return res.text()
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get("openid.mode")

    if (mode !== "id_res") {
      console.error("Invalid OpenID mode:", mode)
      return NextResponse.redirect(new URL("/", request.url))
    }

    // Deduplicate by nonce — prevents duplicate verify calls from concurrent instances
    const nonce = searchParams.get("openid.response_nonce") ?? ""
    pruneNonces()
    if (usedNonces.has(nonce)) {
      console.error("Duplicate nonce rejected:", nonce)
      return NextResponse.redirect(new URL("/", request.url))
    }
    usedNonces.set(nonce, Date.now())

    const verifyParams = new URLSearchParams()
    for (const [key, value] of searchParams.entries()) {
      if (key.startsWith("openid.")) {
        verifyParams.append(key, key === "openid.mode" ? "check_authentication" : value)
      }
    }

    const verifyText = await verifySteamOpenId(verifyParams)

    if (!verifyText.includes("is_valid:true")) {
      console.error("Steam authentication verification failed")
      return NextResponse.redirect(new URL("/", request.url))
    }

    // Step 2: Extract the Steam ID
    // The claimed_id parameter contains the Steam ID in the format:
    // https://steamcommunity.com/openid/id/76561198XXXXXXXXX
    const claimedId = searchParams.get("openid.claimed_id") || ""
    const steamIdMatch = claimedId.match(/(\d+)$/)

    if (!steamIdMatch) {
      console.error("Could not extract Steam ID from claimed_id:", claimedId)
      return NextResponse.redirect(new URL("/", request.url))
    }

    const steamId = steamIdMatch[1]

    // Step 3: Create a session cookie
    await createSteamSession(steamId);

    // Step 4: Redirect to the inventory page
    // We don't fetch inventory data here - we'll let the client fetch it
    return NextResponse.redirect(new URL("/", request.url))
  } catch (error) {
    console.error("Error in Steam callback:", error)
    return NextResponse.redirect(new URL("/", request.url))
  }
}

