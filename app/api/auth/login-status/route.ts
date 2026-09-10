import { type NextRequest, NextResponse } from "next/server";
import { authEmitter, getQRSession } from "@/lib/qr-state";
import { createQRSession } from "@/lib/session";

// Create a variable to track if we've received an authentication event
let lastAuthEvent: any = null;

// Register listener only once per process using a global flag
const globalAny = global as any;
if (!globalAny.__loginStatusListenerRegistered) {
  globalAny.__loginStatusListenerRegistered = true;
  authEmitter.on("authenticated", (data) => {
    console.log("Auth event received in login-status");
    globalAny.__lastAuthEvent = {
      timestamp: Date.now(),
      data,
    };
  });
}

function accountIdToSteamID64(accountId: number | string): string {
  const STEAMID64_BASE = BigInt("76561197960265728");
  return (STEAMID64_BASE + BigInt(accountId)).toString();
}

export async function GET(request: NextRequest) {
  try {
    const globalAny = global as any;
    // Check if we have a recent auth event (within the last 10 seconds)
    if (globalAny.__lastAuthEvent && Date.now() - globalAny.__lastAuthEvent.timestamp < 10000) {
      console.log("Using recent auth event for login status");

      const authData = globalAny.__lastAuthEvent.data;
      globalAny.__lastAuthEvent = null;

      const steamID = accountIdToSteamID64(authData.steamId.accountid);

      // Store refresh token server-side only, never send to client
      await createQRSession(steamID, authData.refreshToken);

      return NextResponse.json({
        loggedIn: true,
        responseStatus: "loggedIn",
        session: {
          accountName: authData.accountName,
          steamID,
        },
      });
    }

    // Check if we have an active session from the QR login
    const session = getQRSession();
    console.log('[login-status] session:', !!session, 'accessToken:', !!session?.accessToken, 'accountName:', session?.accountName);
    if (session && session.accessToken) {
      try {
        const steamID = accountIdToSteamID64(session.steamID.accountid);

        // Store refresh token server-side only, never send to client
        await createQRSession(steamID, session.refreshToken);

        return NextResponse.json({
          loggedIn: true,
          responseStatus: "loggedIn",
          session: {
            accountName: session.accountName,
            steamID,
          },
        });
      } catch (error) {
        console.error("Session validation error:", error);
      }
    }

    // No active session found
    return NextResponse.json({ loggedIn: false });
  } catch (error) {
    console.error("Error checking login status:", error);
    return NextResponse.json({
      loggedIn: false,
      error: "Failed to check login status",
    });
  }
}
