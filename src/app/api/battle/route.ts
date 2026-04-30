import { NextRequest, NextResponse } from "next/server";
import { auth, getCurrentDbUser } from "@/lib/auth";
import { logEvent, supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await getCurrentDbUser();
  if (!user) {
    const session = await auth();
    const spotifyId = (session as any)?.spotifyId as string | undefined;
    // 401 here is never “empty playlist” — battle insert doesn’t read tracks yet.
    if (spotifyId) {
      const payload = {
        error: "unauthorized" as const,
        reason: "user_row_missing" as const,
        message:
          "Signed in with Spotify, but your user was not found in the database. Check Vercel env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and that `users` exists (run schema.sql)."
      };
      console.error("[api/battle POST] 401 user_row_missing", { spotifyId });
      return NextResponse.json(payload, { status: 401 });
    }
    const payload = {
      error: "unauthorized" as const,
      reason: "no_session" as const,
      message:
        "Not signed in. Log in again (session cookie may be missing for this origin)."
    };
    console.error("[api/battle POST] 401 no_session");
    return NextResponse.json(payload, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const playlistId = body?.playlistId;
  if (!playlistId || typeof playlistId !== "string") {
    return NextResponse.json({ error: "playlistId required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("battles")
    .insert({
      host_user_id: user.id,
      host_playlist_id: playlistId,
      status: "waiting"
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("battle insert failed", error);
    return NextResponse.json({ error: "db_failed" }, { status: 500 });
  }

  await logEvent("battle_created", data.id, { hostPlaylist: playlistId });
  return NextResponse.json({ battleId: data.id });
}

export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data } = await supabaseAdmin()
    .from("battles")
    .select("*")
    .or(`host_user_id.eq.${user.id},opponent_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(5);
  return NextResponse.json({ battles: data ?? [] });
}
