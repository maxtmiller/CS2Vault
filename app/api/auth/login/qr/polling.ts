import { LoginSession, EAuthTokenPlatformType } from "steam-session"
import QRCode from "qrcode"
import type { PendingQRLogin } from "@/lib/session"

// Serverless instances don't share memory and freeze between requests, so instead of keeping a
// LoginSession alive and letting it poll in the background, we start the QR session, hand the
// clientId/requestId back to the caller (stored in a cookie), and poll once per status request.
// steam-session has no public API for this, hence the private field access.

export async function startQRLogin() {
  const s = new LoginSession(EAuthTokenPlatformType.SteamClient)
  const { qrChallengeUrl } = await s.startWithQR()
  if (!qrChallengeUrl) throw new Error("QR Challenge URL is missing")

  const { clientId, requestId } = (s as any)._startSessionResponse
  s.cancelLoginAttempt()

  return {
    qrCodeDataUrl: await QRCode.toDataURL(qrChallengeUrl),
    pending: { clientId, requestId: requestId.toString("base64") } as PendingQRLogin,
  }
}

export async function pollQRLogin(pending: PendingQRLogin) {
  const s = new LoginSession(EAuthTokenPlatformType.SteamClient)
  const res = await (s as any)._handler.pollLoginStatus({
    clientId: pending.clientId,
    requestId: Buffer.from(pending.requestId, "base64"),
  })

  if (!res.refreshToken) {
    return { done: false as const, newClientId: res.newClientId as string | undefined }
  }

  s.refreshToken = res.refreshToken
  return {
    done: true as const,
    steamID: s.steamID!.getSteamID64(),
    accountName: res.accountName as string,
    refreshToken: res.refreshToken as string,
  }
}
