import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listOwnPlaylists, getMe } from "@/lib/spotify";

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
    console.error("playlists fetch failed", err);
    return NextResponse.json({ error: "spotify_failed", detail: String(err) }, { status: 502 });
  }
}
