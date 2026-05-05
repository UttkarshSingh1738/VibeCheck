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

  // We need each user's own OAuth access token to read their playlists. The
  // join route stashed both on the battle row. Spotify's Client Credentials
  // flow no longer reliably reads playlist `/items` for new apps.
  const hostToken = battle.host_access_token as string | null;
  const oppToken = battle.opponent_access_token as string | null;
  if (!hostToken || !oppToken) {
    await sb.from("battles").update({ status: "failed" }).eq("id", battle.id);
    await logEvent("score_failed", battle.id, { stage: "missing_token", hostToken: !!hostToken, oppToken: !!oppToken });
    return NextResponse.json(
      {
        error: "missing_user_tokens",
        detail:
          "Battle is missing one of the user OAuth tokens. Both players must sign in fresh and start a new battle (older battles created before this fix can't be scored)."
      },
      { status: 400 }
    );
  }

  await logEvent("score_started", battle.id, {});

  const work: Array<Promise<void>> = [];
  const scoreSide = async (side: Side, playlistId: string, token: string) => {
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

  work.push(scoreSide("host", battle.host_playlist_id, hostToken));
  work.push(scoreSide("opponent", battle.opponent_playlist_id, oppToken));

  try {
    await Promise.all(work);
  } catch (err) {
    await sb.from("battles").update({ status: "failed" }).eq("id", battle.id);
    await logEvent("score_failed", battle.id, { err: String(err) });
    return NextResponse.json({ error: "scoring_failed", detail: String(err) }, { status: 500 });
  }

  // Clear the stored tokens once we're done — we don't need them anymore and
  // they're sensitive. Best-effort; ignore failures.
  void sb
    .from("battles")
    .update({ host_access_token: null, opponent_access_token: null })
    .eq("id", battle.id);

  const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await sb
    .from("battles")
    .update({ status: "voting", vote_closes_at: closesAt })
    .eq("id", battle.id);

  await logEvent("score_completed", battle.id, {});
  return NextResponse.json({ status: "voting" });
}
