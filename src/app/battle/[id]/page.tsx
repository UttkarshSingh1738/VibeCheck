"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BattleDetail, Scorecard } from "@/lib/types";
import { ScorecardDisplay } from "@/components/ScorecardDisplay";
import { aiAverage, hybridScore } from "@/lib/score";

export default function BattleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [detail, setDetail] = useState<BattleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/battle/${id}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const d = (await res.json()) as BattleDetail;
        if (stop) return;
        setDetail(d);
        if (d.battle.status === "done") {
          router.push(`/results/${id}`);
          return;
        }
      } catch (e) {
        if (!stop) setError(String(e));
      }
    }
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, router]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (error) return <p className="text-red-400 py-8">Error: {error}</p>;
  if (!detail) return <p className="text-zinc-400 py-8">Loading…</p>;

  const { battle } = detail;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = `${origin}/battle/${id}/join`;
  const voteUrl = `${origin}/vote/${id}`;

  return (
    <main className="space-y-8 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Battle</h1>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs uppercase tracking-widest text-zinc-300">
          {battle.status}
        </span>
      </header>

      {battle.status === "waiting" && (
        <WaitingPanel joinUrl={joinUrl} copied={copied} onCopy={copy} />
      )}

      {battle.status === "scoring" && <ScoringPanel />}

      {battle.status === "voting" && (
        <VotingReveal
          detail={detail}
          voteUrl={voteUrl}
          copied={copied}
          onCopy={copy}
          onFinalize={async () => {
            const res = await fetch(`/api/battle/${id}/finalize`, { method: "POST" });
            if (res.ok) router.push(`/results/${id}`);
            else alert(`Finalize failed: ${res.status}`);
          }}
        />
      )}

      {battle.status === "failed" && <FailedPanel />}
    </main>
  );
}

/* ---------- panels ---------- */

function WaitingPanel({
  joinUrl,
  copied,
  onCopy
}: {
  joinUrl: string;
  copied: string | null;
  onCopy: (s: string, k: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Waiting for opponent
      </div>
      <p className="mt-2 text-zinc-300">Share this link:</p>
      <div className="mt-3 flex gap-2">
        <input
          value={joinUrl}
          readOnly
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
        />
        <button
          onClick={() => onCopy(joinUrl, "join")}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          {copied === "join" ? "Copied!" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function ScoringPanel() {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-spotify/10 p-8 text-center">
      <div className="text-sm font-semibold uppercase tracking-widest text-spotify">
        AI is listening
      </div>
      <div className="mt-3 text-3xl font-bold">Analyzing both playlists…</div>
      <p className="mt-2 text-sm text-zinc-400">
        Claude is scoring cohesion, diversity, discovery, vibe & lyrical depth.
      </p>
      <div className="mx-auto mt-6 h-2 w-2/3 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full w-1/3 animate-pulse bg-spotify" />
      </div>
    </section>
  );
}

function FailedPanel() {
  return (
    <section className="rounded-2xl border border-red-800/50 bg-red-950/30 p-6">
      <div className="text-sm font-semibold uppercase tracking-wide text-red-400">
        Scoring failed
      </div>
      <p className="mt-2 text-zinc-300">
        Something went wrong analyzing the playlists. Make sure both playlists are public and have
        tracks, then start a new battle. Check server logs for details.
      </p>
    </section>
  );
}

function VotingReveal({
  detail,
  voteUrl,
  copied,
  onCopy,
  onFinalize
}: {
  detail: BattleDetail;
  voteUrl: string;
  copied: string | null;
  onCopy: (s: string, k: string) => void;
  onFinalize: () => void;
}) {
  const { host, opponent, scorecards, tally } = detail;
  const hostName = host.user?.display_name ?? "Host";
  const oppName = opponent.user?.display_name ?? "Opponent";
  const hostCard = scorecards.host;
  const oppCard = scorecards.opponent;

  const { aiWinner, aiHostAvg, aiOppAvg, hybrid } = useMemo(() => {
    const empty = { cohesion: 0, diversity: 0, discovery: 0, vibe: 0, lyrical_depth: 0, commentary: "" };
    const h = hostCard ? toScorecard(hostCard) : empty;
    const o = oppCard ? toScorecard(oppCard) : empty;
    const aiH = aiAverage(h);
    const aiO = aiAverage(o);
    const total = tally.host + tally.opponent;
    return {
      aiWinner: aiO > aiH ? "opponent" : "host",
      aiHostAvg: aiH,
      aiOppAvg: aiO,
      hybrid: { host: hybridScore(h, tally.host, total), opp: hybridScore(o, tally.opponent, total) }
    };
  }, [hostCard, oppCard, tally]);

  if (!hostCard || !oppCard) {
    return <p className="text-zinc-400">Scorecards not yet available — refresh in a sec.</p>;
  }

  const winnerName = aiWinner === "host" ? hostName : oppName;
  const margin = Math.abs(aiHostAvg - aiOppAvg);

  return (
    <div className="space-y-8">
      {/* AI VERDICT HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-spotify/40 bg-gradient-to-br from-spotify/20 via-zinc-900 to-zinc-900 p-8">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-spotify/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-spotify">
            AI&apos;s Verdict
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-5xl">🏆</span>
            <h2 className="text-4xl font-extrabold tracking-tight">{winnerName}</h2>
          </div>
          <p className="mt-2 text-zinc-300">
            wins by <span className="font-bold text-white">{margin.toFixed(1)} points</span> on
            Claude&apos;s 5-dimension scorecard
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
            <ScoreChip label={hostName} value={aiHostAvg} highlighted={aiWinner === "host"} />
            <span className="text-zinc-600">vs</span>
            <ScoreChip label={oppName} value={aiOppAvg} highlighted={aiWinner === "opponent"} />
          </div>
        </div>
      </section>

      {/* SCORECARDS SIDE-BY-SIDE */}
      <section className="grid gap-6 md:grid-cols-2">
        <BattleSide
          name={hostName}
          playlistName={host.playlistName ?? detail.battle.host_playlist_id}
          card={hostCard}
          aiAvg={aiHostAvg}
          isAiWinner={aiWinner === "host"}
        />
        <BattleSide
          name={oppName}
          playlistName={opponent.playlistName ?? detail.battle.opponent_playlist_id ?? ""}
          card={oppCard}
          aiAvg={aiOppAvg}
          isAiWinner={aiWinner === "opponent"}
        />
      </section>

      {/* LIVE VOTING PANEL */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Friends are voting · live
            </div>
            <div className="mt-1 text-lg font-semibold">
              The crowd can flip it. Hybrid = 50% AI + 50% friend votes.
            </div>
          </div>
          <button
            onClick={onFinalize}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
          >
            Release final results →
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TallyCard name={hostName} votes={tally.host} hybrid={hybrid.host} />
          <TallyCard name={oppName} votes={tally.opponent} hybrid={hybrid.opp} />
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Vote link — share this with friends:
          </div>
          <div className="flex gap-2">
            <input
              value={voteUrl}
              readOnly
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs"
            />
            <button
              onClick={() => onCopy(voteUrl, "vote")}
              className="rounded-lg bg-spotify px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
            >
              {copied === "vote" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- bits ---------- */

function ScoreChip({ label, value, highlighted }: { label: string; value: number; highlighted: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-400">{label}</span>
      <span
        className={`rounded-full px-3 py-1 font-bold tabular-nums ${
          highlighted ? "bg-spotify text-black" : "bg-zinc-800 text-zinc-200"
        }`}
      >
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function BattleSide({
  name,
  playlistName,
  card,
  aiAvg,
  isAiWinner
}: {
  name: string;
  playlistName: string;
  card: NonNullable<BattleDetail["scorecards"]["host"]>;
  aiAvg: number;
  isAiWinner: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-5 transition ${
        isAiWinner ? "border-spotify bg-spotify/5" : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-400">{name}</div>
          <div className="text-lg font-semibold">{playlistName}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">AI avg</div>
          <div className="text-2xl font-bold tabular-nums">{aiAvg.toFixed(1)}</div>
        </div>
      </div>
      <ScorecardDisplay scorecard={toScorecard(card)} />
    </div>
  );
}

function TallyCard({ name, votes, hybrid }: { name: string; votes: number; hybrid: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{name}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">Friend votes</div>
          <div className="text-2xl font-bold tabular-nums">{votes}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">Hybrid</div>
          <div className="text-2xl font-bold tabular-nums text-spotify">{hybrid.toFixed(1)}</div>
        </div>
      </div>
    </div>
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
