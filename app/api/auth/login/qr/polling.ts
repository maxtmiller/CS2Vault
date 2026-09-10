import { LoginSession, EAuthTokenPlatformType } from "steam-session"
import QRCode from "qrcode"
import { authEmitter, setQRSession, getQRSession } from "@/lib/qr-state"

export { authEmitter }

export async function flowLoginRegularQR() {
  const s = new LoginSession(EAuthTokenPlatformType.SteamClient)
  setQRSession(s)
  console.log("Start with QR")

  return new Promise(async (resolve) => {
    s.on("authenticated", async () => {
      console.log(`Logged into Steam as ${s.accountName}`)

      authEmitter.emit("authenticated", {
        steamId: s.steamID,
        accountName: s.accountName,
        refreshToken: s.refreshToken,
        accessToken: s.accessToken,
      })

      resolve({ responseStatus: "loggedIn", session: s })
    })

    s.once("timeout", () => {
      console.log("Login attempt timed out.")
      resolve({ responseStatus: "defaultError" })
    })

    s.once("error", (err: Error) => {
      console.log("Error:", err.message)
      resolve({ responseStatus: "defaultError" })
    })

    try {
      console.log("Attempting to start QR login...")
      const result = await s.startWithQR()

      if (!result || !result.qrChallengeUrl) {
        throw new Error("QR Challenge URL is missing")
      }

      console.log(`Scan this QR code to log in: ${result.qrChallengeUrl}`)

      const qrCodeDataUrl = await QRCode.toDataURL(result.qrChallengeUrl)

      resolve({
        responseStatus: "waitingForQR",
        qrCodeDataUrl,
        qrChallengeUrl: result.qrChallengeUrl,
        session: s,
      })
    } catch (err) {
      if (err instanceof Error) {
        console.error("QR Login failed:", err.message)
      } else {
        console.error(`Unknown error:`, err)
      }
      resolve({ responseStatus: "defaultError" })
    }
  })
}

export async function refreshQrCode() {
  const s = getQRSession()
  if (!s) {
    return { responseStatus: "defaultError", message: "Session not initialized." }
  }
  try {
    const result = await s.startWithQR()
    if (!result || !result.qrChallengeUrl) {
      throw new Error("QR Challenge URL is missing")
    }
    const qrCodeDataUrl = await QRCode.toDataURL(result.qrChallengeUrl)
    return { responseStatus: "waitingForQR", qrCodeDataUrl, qrChallengeUrl: result.qrChallengeUrl }
  } catch (err) {
    if (err instanceof Error) {
      console.error("QR Refresh failed:", err.message)
    } else {
      console.error(`Unknown error:`, err)
    }
    return { responseStatus: "defaultError" }
  }
}
