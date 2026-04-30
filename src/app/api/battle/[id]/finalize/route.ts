import { NextResponse } from "next/server";
import { supabaseAdmin, logEvent } from "@/lib/supabase";
import { pickWinner } from "@/lib/score";
import type { DBScorecard, Scorecard, Side } from "@/lib/types";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: battle } = await sb.from("battles").select("*").eq("id", params.id).maybeSingle();
  if (!battle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (battle.status === "done") return NextResponse.json({ status: "done", winner: battle.winner });

  const { data: cards } = await sb
    .from("scorecards")
    .select("*")
    .eq("battle_id", battle.id);
  if (!cards || cards.length < 2) {
    return NextResponse.json({ error: "scorecards_missing" }, { status: 400 });
  }
  const bySide = new Map<Side, DBScorecard>(cards.map((c) => [c.side as Side, c as DBScorecard]));
  const host = bySide.get("host");
  const opp = bySide.get("opponent");
  if (!host || !opp) return NextResponse.json({ error: "scorecards_missing" }, { status: 400 });

  const { data: votes } = await sb.from("votes").select("choice").eq("battle_id", battle.id);
  let hostVotes = 0;
  let oppVotes = 0;
  for (const v of votes ?? []) {
    if (v.choice === "host") hostVotes += 1;
    else if (v.choice === "opponent") oppVotes += 1;
  }

  const stripCard = (c: DBScorecard): Scorecard => ({
    cohesion: c.cohesion,
    diversity: c.diversity,
    discovery: c.discovery,
    vibe: c.vibe,
    lyrical_depth: c.lyrical_depth,
    commentary: c.commentary
  });
  const result = pickWinner(stripCard(host), stripCard(opp), hostVotes, oppVotes);

  await sb
    .from("battles")
    .update({ status: "done", winner: result.winner })
    .eq("id", battle.id);
  await logEvent("battle_finalized", battle.id, {
    hostHybrid: result.hostHybrid,
    oppHybrid: result.oppHybrid,
    hostVotes,
    oppVotes
  });

  return NextResponse.json({
    status: "done",
    winner: result.winner,
    hostHybrid: result.hostHybrid,
    oppHybrid: result.oppHybrid
  });
}
