import { cookies } from "next/headers";

export async function createSteamSession(steamId: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    "steam_session",
    JSON.stringify({
      steamId,
      authenticated: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: (24 * 60 * 60) - 1,
      path: "/",
    }
  );
}
