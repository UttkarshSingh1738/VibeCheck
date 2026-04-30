"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { BattleDetail, Scorecard } from "@/lib/types";
import { ScorecardDisplay } from "@/components/ScorecardDisplay";
import { aiAverage, hybridScore } from "@/lib/score";

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<BattleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Try to finalize first (idempotent if already done).
        await fetch(`/api/battle/${id}/finalize`, { method: "POST" }).catch(() => undefined);
        const r = await fetch(`/api/battle/${id}`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        setDetail((await r.json()) as BattleDetail);
      } catch (e) {
        setError(String(e));
      }
    }
    load();
  }, [id]);

  if (error) return <p className="text-red-400 py-8">Error: {error}</p>;
  if (!detail) return <p className="text-zinc-400 py-8">Loading…</p>;

  const { host, opponent, scorecards, battle, tally } = detail;
  const hostName = host.user?.display_name ?? "Host";
  const oppName = opponent.user?.display_name ?? "Opponent";
  const hostCard = scorecards.host;
  const oppCard = scorecards.opponent;

  if (!hostCard || !oppCard) {
    return <p className="py-8 text-zinc-300">Scorecards aren’t ready yet — refresh in a moment.</p>;
  }

  const total = tally.host + tally.opponent;
  const hostHybrid = hybridScore(toScorecard(hostCard), tally.host, total);
  const oppHybrid = hybridScore(toScorecard(oppCard), tally.opponent, total);
  const winner = battle.winner ?? (oppHybrid > hostHybrid ? "opponent" : "host");
  const winnerName = winner === "host" ? hostName : oppName;

  return (
    <main className="space-y-8 py-6">
      <header className="text-center">
        <div className="text-sm uppercase tracking-widest text-zinc-400">Winner</div>
        <h1 className="mt-2 text-4xl font-bold">🏆 {winnerName}</h1>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <ResultColumn
          name={hostName}
          playlistName={host.playlistName ?? battle.host_playlist_id}
          card={hostCard}
          votes={tally.host}
          hybrid={hostHybrid}
          isWinner={winner === "host"}
        />
        <ResultColumn
          name={oppName}
          playlistName={opponent.playlistName ?? battle.opponent_playlist_id ?? ""}
          card={oppCard}
          votes={tally.opponent}
          hybrid={oppHybrid}
          isWinner={winner === "opponent"}
        />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-300">
        <div className="font-mono">
          AI: {aiAverage(toScorecard(hostCard)).toFixed(1)} vs{" "}
          {aiAverage(toScorecard(oppCard)).toFixed(1)} · Friend votes: {tally.host} vs{" "}
          {tally.opponent} · Hybrid: {hostHybrid.toFixed(1)} vs {oppHybrid.toFixed(1)}
        </div>
      </section>

      <div className="flex justify-center gap-3">
        <button
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
        >
          Copy results link
        </button>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `${winnerName} just won a VibeCheck battle. Settle the music-taste debate: ${
              typeof window !== "undefined" ? window.location.href : ""
            }`
          )}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-zinc-800 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Tweet result
        </a>
      </div>
    </main>
  );
}

function toScorecard(c: NonNullable<BattleDetail["scorecards"]["host"]>): Scorecard {
  return {
    cohesion: c.cohesion,
    diversity: c.diversity,
    discovery: c.discovery,
    vibe: c.vibe,
    lyrical_depth: c.lyrical_depth,
    commentary: c.commentary
  };
}

function ResultColumn({
  name,
  playlistName,
  card,
  votes,
  hybrid,
  isWinner
}: {
  name: string;
  playlistName: string;
  card: NonNullable<BattleDetail["scorecards"]["host"]>;
  votes: number;
  hybrid: number;
  isWinner: boolean;
}) {
  return (
    <div
      className={`space-y-4 rounded-2xl border p-5 ${
        isWinner ? "border-spotify bg-spotify/5" : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-400">{name}</div>
          <div className="text-lg font-semibold">{playlistName}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">Hybrid</div>
          <div className="text-2xl font-bold tabular-nums">{hybrid.toFixed(1)}</div>
        </div>
      </div>
      <ScorecardDisplay scorecard={toScorecard(card)} />
      <div className="text-xs text-zinc-400">Friend votes: {votes}</div>
    </div>
  );
}
