import { NextResponse } from "next/server";
import { pollQRLogin } from "../login/qr/polling";
import {
  clearPendingQRLogin,
  createQRSession,
  getPendingQRLogin,
  setPendingQRLogin,
} from "@/lib/session";

export async function GET() {
  const pending = await getPendingQRLogin();
  if (!pending) {
    return NextResponse.json({ loggedIn: false, reason: "expired" });
  }

  try {
    const result = await pollQRLogin(pending);

    if (!result.done) {
      if (result.newClientId) {
        await setPendingQRLogin({ ...pending, clientId: result.newClientId });
      }
      return NextResponse.json({ loggedIn: false });
    }

    await clearPendingQRLogin();
    // Store refresh token server-side only, never send to client
    await createQRSession(result.steamID, result.refreshToken);

    return NextResponse.json({
      loggedIn: true,
      responseStatus: "loggedIn",
      session: {
        accountName: result.accountName,
        steamID: result.steamID,
      },
    });
  } catch (error) {
    // Steam errors here once the QR session expires or is denied
    console.error("Error checking login status:", error);
    await clearPendingQRLogin();
    return NextResponse.json({ loggedIn: false, reason: "expired" });
  }
}
