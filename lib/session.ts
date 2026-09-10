import { cookies } from "next/headers";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || "cs2vault-default-key-32byteslong!!";
const KEY = Buffer.from(ENCRYPTION_KEY.slice(0, 32), "utf8");

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: (24 * 60 * 60) - 1,
  path: "/",
};

export async function createSteamSession(steamId: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    "steam_session",
    JSON.stringify({
      steamId,
      authenticated: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }),
    COOKIE_OPTS
  );
}

export async function createQRSession(steamId: string, refreshToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    "steam_session",
    JSON.stringify({
      steamId,
      authenticated: true,
      loginType: "qr",
      expiresAt: Date.now() + 7 * 60 * 60 * 1000, // 7 hours (refresh token lifetime)
    }),
    COOKIE_OPTS
  );
  cookieStore.set(
    "steam_refresh",
    encrypt(refreshToken),
    { ...COOKIE_OPTS, maxAge: 7 * 60 * 60 }
  );
}

export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("steam_refresh");
  if (!cookie) return null;
  try {
    return decrypt(cookie.value);
  } catch {
    return null;
  }
}
