import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { BattleDetail, DBBattle, DBScorecard, DBUser, Side } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: battle } = await sb.from("battles").select("*").eq("id", params.id).maybeSingle<DBBattle>();
  if (!battle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const userIds = [battle.host_user_id, battle.opponent_user_id].filter(Boolean) as string[];
  const { data: users } = await sb.from("users").select("*").in("id", userIds);
  const userById = new Map<string, DBUser>((users ?? []).map((u) => [u.id, u as DBUser]));

  const { data: scorecards } = await sb
    .from("scorecards")
    .select("*")
    .eq("battle_id", battle.id);
  const cardBySide = new Map<Side, DBScorecard>(
    (scorecards ?? []).map((c) => [c.side as Side, c as DBScorecard])
  );

  const { data: votes } = await sb.from("votes").select("choice").eq("battle_id", battle.id);
  const tally = { host: 0, opponent: 0 };
  for (const v of votes ?? []) {
    if (v.choice === "host") tally.host += 1;
    else if (v.choice === "opponent") tally.opponent += 1;
  }

  // Names are cached on the battle row at create/join time. No Spotify call
  // here — this endpoint is hit every 3s by the polling UI, which would
  // otherwise hammer Spotify and trigger 429 rate limits.
  const detail: BattleDetail = {
    battle,
    host: {
      user: userById.get(battle.host_user_id) ?? null,
      playlistName: battle.host_playlist_name
    },
    opponent: {
      user: battle.opponent_user_id ? userById.get(battle.opponent_user_id) ?? null : null,
      playlistName: battle.opponent_playlist_name
    },
    scorecards: {
      host: cardBySide.get("host") ?? null,
      opponent: cardBySide.get("opponent") ?? null
    },
    tally
  };

  return NextResponse.json(detail);
}
