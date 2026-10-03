import { NextResponse } from "next/server"
import { setPendingQRLogin } from "@/lib/session"

export async function GET() {
  try {
    const { startQRLogin } = await import("./polling")
    const { qrCodeDataUrl, pending } = await startQRLogin()
    await setPendingQRLogin(pending)
    return NextResponse.json({ qrCodeDataUrl })
  } catch (error) {
    console.error("Error in QR authentication:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
