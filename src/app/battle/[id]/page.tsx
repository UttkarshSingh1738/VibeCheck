"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { BattleDetail } from "@/lib/types";

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
              onClick={() => copy(joinUrl, "join")}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              {copied === "join" ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>
      )}

      {battle.status === "scoring" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Scoring</div>
          <p className="mt-2 text-zinc-300">
            Both players locked in. Analyzing playlists with Claude…
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-1/3 animate-pulse bg-spotify" />
          </div>
        </section>
      )}

      {battle.status === "voting" && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Voting open
          </div>
          <p className="mt-2 text-zinc-300">Send this to friends:</p>
          <div className="mt-3 flex gap-2">
            <input
              value={voteUrl}
              readOnly
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm"
            />
            <button
              onClick={() => copy(voteUrl, "vote")}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              {copied === "vote" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-4 text-sm text-zinc-300">
            Tally so far: <strong>{detail.tally.host}</strong> vs <strong>{detail.tally.opponent}</strong>
          </div>
          <button
            onClick={async () => {
              const res = await fetch(`/api/battle/${id}/finalize`, { method: "POST" });
              if (res.ok) router.push(`/results/${id}`);
              else alert(`Finalize failed: ${res.status}`);
            }}
            className="mt-4 rounded-full bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700"
          >
            Release results now
          </button>
        </section>
      )}

      {battle.status === "failed" && (
        <section className="rounded-2xl border border-red-800/50 bg-red-950/30 p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-red-400">
            Scoring failed
          </div>
          <p className="mt-2 text-zinc-300">
            Something went wrong analyzing the playlists. Make sure both playlists are public on
            Spotify and try creating a new battle. Check server logs for details.
          </p>
        </section>
      )}
    </main>
  );
}
