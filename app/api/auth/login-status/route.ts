import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { session, authEmitter } from "../login/qr/polling";

// Create a variable to track if we've received an authentication event
let lastAuthEvent: any = null;

// Listen for authentication events
authEmitter.on("authenticated", (data) => {
  console.log("Auth event received in login-status");
  lastAuthEvent = {
    timestamp: Date.now(),
    data,
  };
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accountIdToSteamID64(accountId: number | string): string {
  const STEAMID64_BASE = BigInt("76561197960265728");
  return (STEAMID64_BASE + BigInt(accountId)).toString();
}

export async function GET(request: NextRequest) {
  try {
    // Check if we have a recent auth event (within the last 10 seconds)
    if (lastAuthEvent && Date.now() - lastAuthEvent.timestamp < 10000) {
      console.log("Using recent auth event for login status");

      // Clear the event after using it
      const authData = lastAuthEvent.data;
      lastAuthEvent = null;

      authData.steamID = accountIdToSteamID64(authData.steamId.accountid);

      return NextResponse.json({
        loggedIn: true,
        responseStatus: "loggedIn",
        session: authData,
      });
    }

    // Check if we have an active session from the QR login
    console.log('[login-status] session:', !!session, 'accessToken:', !!session?.accessToken, 'accountName:', session?.accountName);
    if (session && session.accessToken) {
      // Verify the session is still valid
      try {
        // You could add additional validation here if needed
        return NextResponse.json({
          loggedIn: true,
          responseStatus: "loggedIn",
          session: {
            accountName: session.accountName,
            steamID: accountIdToSteamID64(session.steamID.accountid),
            refreshToken: session.refreshToken,
            accessToken: session.accessToken,
            // accessTokenSetAt: session.accessTokenSetAt,
          },
        });
      } catch (error) {
        console.error("Session validation error:", error);
        // If validation fails, continue to cookie check
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
