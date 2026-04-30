"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { BattleDetail } from "@/lib/types";
import { ScorecardDisplay } from "@/components/ScorecardDisplay";

export default function VotePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<BattleDetail | null>(null);
  const [tally, setTally] = useState<{ host: number; opponent: number } | null>(null);
  const [voted, setVoted] = useState<"host" | "opponent" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/battle/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d: BattleDetail) => {
        setDetail(d);
        setTally(d.tally);
      })
      .catch((e) => setError(String(e)));
    if (typeof window !== "undefined") {
      const v = localStorage.getItem(`vibecheck:vote:${id}`);
      if (v === "host" || v === "opponent") setVoted(v);
    }
  }, [id]);

  async function castVote(choice: "host" | "opponent") {
    const res = await fetch(`/api/vote/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice })
    });
    const data = await res.json();
    if (data.tally) setTally(data.tally);
    setVoted(choice);
    try {
      localStorage.setItem(`vibecheck:vote:${id}`, choice);
    } catch {
      /* ignore */
    }
  }

  if (error) return <p className="text-red-400 py-8">Error: {error}</p>;
  if (!detail) return <p className="text-zinc-400 py-8">Loading…</p>;

  if (detail.battle.status !== "voting" && detail.battle.status !== "done") {
    return (
      <p className="py-8 text-zinc-300">
        This battle isn’t ready for voting yet. Status: {detail.battle.status}.
      </p>
    );
  }

  const { host, opponent, scorecards } = detail;
  const hostName = host.user?.display_name ?? "Host";
  const oppName = opponent.user?.display_name ?? "Opponent";

  return (
    <main className="space-y-8 py-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">Cast your vote</h1>
        <p className="text-sm text-zinc-400">Whose playlist actually slaps harder?</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Side
          name={hostName}
          playlistName={host.playlistName ?? detail.battle.host_playlist_id}
          card={scorecards.host}
          onVote={() => castVote("host")}
          disabled={!!voted}
          highlighted={voted === "host"}
          tally={tally?.host ?? 0}
        />
        <Side
          name={oppName}
          playlistName={opponent.playlistName ?? detail.battle.opponent_playlist_id ?? ""}
          card={scorecards.opponent}
          onVote={() => castVote("opponent")}
          disabled={!!voted}
          highlighted={voted === "opponent"}
          tally={tally?.opponent ?? 0}
        />
      </div>

      {voted && (
        <p className="text-center text-sm text-zinc-400">
          Thanks! Current count: <strong>{tally?.host ?? 0}</strong> vs{" "}
          <strong>{tally?.opponent ?? 0}</strong>
        </p>
      )}
    </main>
  );
}

function Side({
  name,
  playlistName,
  card,
  onVote,
  disabled,
  highlighted,
  tally
}: {
  name: string;
  playlistName: string;
  card: BattleDetail["scorecards"]["host"];
  onVote: () => void;
  disabled: boolean;
  highlighted: boolean;
  tally: number;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-5 ${
        highlighted ? "border-spotify bg-spotify/10" : "border-zinc-800 bg-zinc-900/60"
      }`}
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-400">{name}</div>
        <div className="text-lg font-semibold">{playlistName}</div>
      </div>
      {card ? (
        <ScorecardDisplay scorecard={card} />
      ) : (
        <p className="text-sm text-zinc-400">Scorecard not ready yet.</p>
      )}
      <button
        onClick={onVote}
        disabled={disabled}
        className="rounded-full bg-spotify px-4 py-3 font-semibold text-black hover:brightness-110 disabled:opacity-50"
      >
        {disabled ? `Votes: ${tally}` : `Vote for ${name}`}
      </button>
    </div>
  );
}
