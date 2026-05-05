import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listOwnPlaylists, getMe, SpotifyRateLimitError } from "@/lib/spotify";

export async function GET() {
  const session = await auth();
  const token = (session as any)?.accessToken as string | undefined;
  let spotifyId = (session as any)?.spotifyId as string | undefined;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  try {
    if (!spotifyId) {
      const me = await getMe(token);
      spotifyId = me.id;
    }
    const playlists = await listOwnPlaylists(token, spotifyId);
    return NextResponse.json({ playlists });
  } catch (err) {
    if (err instanceof SpotifyRateLimitError) {
      return NextResponse.json(
        {
          error: "rate_limited",
          retryAfterSec: err.retryAfterSec,
          message: `Spotify rate-limited your account. Wait ~${err.retryAfterSec} seconds and retry.`
        },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSec) } }
      );
    }
    console.error("playlists fetch failed", err);
    return NextResponse.json({ error: "spotify_failed", detail: String(err) }, { status: 502 });
  }
}
