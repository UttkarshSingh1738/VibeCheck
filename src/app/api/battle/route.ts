import { NextRequest, NextResponse } from "next/server";
import { getCurrentDbUser } from "@/lib/auth";
import { logEvent, supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

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
