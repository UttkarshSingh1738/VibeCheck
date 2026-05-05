import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Diagnostic-only endpoint. Returns the raw Spotify response shape for a
// single playlist so we can see why /me/playlists is reporting trackCount=0.
// Safe to leave in — it requires a logged-in session.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const token = (session as any)?.accessToken as string | undefined;
  if (!token) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  async function spotify(path: string) {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "(unreadable)");
    }
    return { status: res.status, body };
  }

  const [meta, tracks, mePlaylists] = await Promise.all([
    spotify(`/playlists/${params.id}`),
    spotify(`/playlists/${params.id}/tracks?limit=5`),
    spotify(`/me/playlists?limit=10`)
  ]);

  return NextResponse.json({
    requestedId: params.id,
    fullPlaylistMeta: meta,
    firstFiveTracks: tracks,
    mePlaylistsSample: mePlaylists
  });
}
