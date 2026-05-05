import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth, getCurrentDbUser } from "@/lib/auth";
import { logEvent, supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const playlistId = body?.playlistId;
  if (!playlistId || typeof playlistId !== "string") {
    return NextResponse.json({ error: "playlistId required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: battle } = await sb.from("battles").select("*").eq("id", params.id).maybeSingle();
  if (!battle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (battle.host_user_id === user.id) {
    return NextResponse.json({ error: "host_cannot_join_own_battle" }, { status: 400 });
  }
  if (battle.opponent_user_id && battle.opponent_user_id !== user.id) {
    return NextResponse.json({ error: "battle_full" }, { status: 409 });
  }

  const session = await auth();
  const accessToken = (session as any)?.accessToken as string | undefined;

  // Best-effort fetch of the opponent's playlist display name (cached so the
  // polling battle-detail endpoint doesn't re-hit Spotify on every tick).
  let oppPlaylistName: string | null = null;
  if (accessToken) {
    try {
      const { getPlaylistMeta } = await import("@/lib/spotify");
      const meta = await getPlaylistMeta(accessToken, playlistId);
      oppPlaylistName = meta.name;
    } catch (err) {
      console.warn("opponent playlist name lookup failed", err);
    }
  }

  const { error } = await sb
    .from("battles")
    .update({
      opponent_user_id: user.id,
      opponent_playlist_id: playlistId,
      opponent_playlist_name: oppPlaylistName,
      opponent_access_token: accessToken ?? null,
      status: "scoring"
    })
    .eq("id", params.id);
  if (error) {
    console.error("battle join update failed", error);
    return NextResponse.json({ error: "db_failed" }, { status: 500 });
  }

  await logEvent("opponent_joined", params.id, { opponentPlaylist: playlistId });

  // Trigger scoring after the response is sent. waitUntil keeps the serverless
  // function alive on Vercel; locally it just runs the promise inline. The
  // scoring route is idempotent so retries are safe.
  const origin = new URL(req.url).origin;
  waitUntil(
    fetch(`${origin}/api/battle/${params.id}/score`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SCORE_SECRET ?? ""
      }
    }).catch((e) => console.warn("scoring trigger failed", e))
  );

  return NextResponse.json({ status: "scoring" });
}
