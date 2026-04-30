import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin, logEvent } from "@/lib/supabase";

function fingerprint(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0";
  const ua = req.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("votes").select("choice").eq("battle_id", params.id);
  const tally = { host: 0, opponent: 0 };
  for (const v of data ?? []) {
    if (v.choice === "host") tally.host += 1;
    else if (v.choice === "opponent") tally.opponent += 1;
  }
  return NextResponse.json({ tally });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const choice = body?.choice;
  if (choice !== "host" && choice !== "opponent") {
    return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: battle } = await sb.from("battles").select("status").eq("id", params.id).maybeSingle();
  if (!battle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (battle.status !== "voting") {
    return NextResponse.json({ error: "voting_not_open", status: battle.status }, { status: 409 });
  }

  const fp = fingerprint(req);
  const { error } = await sb.from("votes").insert({
    battle_id: params.id,
    voter_fingerprint: fp,
    choice
  });
  // Unique constraint will reject duplicates — surface a clear status.
  if (error && (error as any).code === "23505") {
    const { data: votes } = await sb.from("votes").select("choice").eq("battle_id", params.id);
    const tally = { host: 0, opponent: 0 };
    for (const v of votes ?? []) {
      if (v.choice === "host") tally.host += 1;
      else if (v.choice === "opponent") tally.opponent += 1;
    }
    return NextResponse.json({ tally, alreadyVoted: true }, { status: 200 });
  }
  if (error) {
    console.error("vote insert failed", error);
    return NextResponse.json({ error: "db_failed" }, { status: 500 });
  }

  await logEvent("vote_cast", params.id, { choice });

  const { data: votes } = await sb.from("votes").select("choice").eq("battle_id", params.id);
  const tally = { host: 0, opponent: 0 };
  for (const v of votes ?? []) {
    if (v.choice === "host") tally.host += 1;
    else if (v.choice === "opponent") tally.opponent += 1;
  }
  return NextResponse.json({ tally });
}
