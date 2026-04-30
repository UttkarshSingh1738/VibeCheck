import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, logEvent } from "@/lib/supabase";
import { buildPlaylistSummary } from "@/lib/spotify";
import { scorePlaylist } from "@/lib/claude";
import type { Side } from "@/lib/types";

export const maxDuration = 60;

// Server-only. The opponent join route triggers this with a shared secret.
// Anyone hitting it directly without the secret gets rejected.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const secret = req.headers.get("x-internal-secret");
  if (!process.env.INTERNAL_SCORE_SECRET || secret !== process.env.INTERNAL_SCORE_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data: battle } = await sb.from("battles").select("*").eq("id", params.id).maybeSingle();
  if (!battle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!battle.opponent_user_id || !battle.opponent_playlist_id) {
    return NextResponse.json({ error: "opponent_not_joined" }, { status: 400 });
  }

  // Idempotency: if both scorecards already exist, no-op.
  const { data: existing } = await sb
    .from("scorecards")
    .select("side")
    .eq("battle_id", battle.id);
  const existingSides = new Set((existing ?? []).map((r) => r.side));
  if (existingSides.has("host") && existingSides.has("opponent")) {
    return NextResponse.json({ status: "already_scored" });
  }

  await logEvent("score_started", battle.id, {});

  // Pull both users so we can use their stored Spotify access tokens... but
  // we don't store tokens. The simpler path: use *one* token (the opponent's
  // access token from the request that triggered the score), but this route
  // is called server-to-server with no user session. So we need a token.
  //
  // For the MVP we use the Client Credentials flow to get a token that can
  // read PUBLIC playlists. Personal playlists must be public for scoring to
  // work. This is documented in DECISIONS.md.
  let token: string;
  try {
    token = await getClientCredentialsToken();
  } catch (err) {
    console.error("failed to get client credentials token", err);
    await sb.from("battles").update({ status: "failed" }).eq("id", battle.id);
    await logEvent("score_failed", battle.id, { stage: "token", err: String(err) });
    return NextResponse.json({ error: "spotify_token_failed" }, { status: 502 });
  }

  const work: Array<Promise<void>> = [];
  const scoreSide = async (side: Side, playlistId: string) => {
    if (existingSides.has(side)) return;
    try {
      const summary = await buildPlaylistSummary(token, playlistId);
      const { scorecard, raw } = await scorePlaylist(summary);
      await sb.from("scorecards").insert({
        battle_id: battle.id,
        side,
        cohesion: scorecard.cohesion,
        diversity: scorecard.diversity,
        discovery: scorecard.discovery,
        vibe: scorecard.vibe,
        lyrical_depth: scorecard.lyrical_depth,
        commentary: scorecard.commentary,
        raw_response: { raw, summaryName: summary.name }
      });
    } catch (err) {
      console.error(`scoring side=${side} failed`, err);
      throw err;
    }
  };

  work.push(scoreSide("host", battle.host_playlist_id));
  work.push(scoreSide("opponent", battle.opponent_playlist_id));

  try {
    await Promise.all(work);
  } catch (err) {
    await sb.from("battles").update({ status: "failed" }).eq("id", battle.id);
    await logEvent("score_failed", battle.id, { err: String(err) });
    return NextResponse.json({ error: "scoring_failed", detail: String(err) }, { status: 500 });
  }

  const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb
    .from("battles")
    .update({ status: "voting", vote_closes_at: closesAt })
    .eq("id", battle.id);

  await logEvent("score_completed", battle.id, {});
  return NextResponse.json({ status: "voting" });
}

async function getClientCredentialsToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Spotify client creds missing");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`spotify token ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
