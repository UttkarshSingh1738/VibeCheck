"use client";
import { useEffect, useState } from "react";
import type { SpotifyPlaylist } from "@/lib/types";
import { Button } from "./ui/Button";

type Props = {
  onSubmit: (playlistId: string) => Promise<void> | void;
  submitLabel?: string;
};

export function PlaylistGrid({ onSubmit, submitLabel = "Create battle" }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/playlists")
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setPlaylists(d.playlists ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-red-400">Couldn’t load playlists: {error}</p>;
  if (!playlists) return <p className="text-zinc-400">Loading your playlists…</p>;
  if (playlists.length === 0) {
    return (
      <p className="text-zinc-400">
        You don’t own any playlists yet. Make one in Spotify and refresh.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {playlists.map((p) => {
          const isActive = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`group rounded-xl border p-3 text-left transition ${
                isActive
                  ? "border-white bg-zinc-800"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
              }`}
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image}
                  alt={p.name}
                  className="aspect-square w-full rounded-md object-cover"
                />
              ) : (
                <div className="aspect-square w-full rounded-md bg-zinc-800" />
              )}
              <div className="mt-2 line-clamp-2 text-sm font-medium">{p.name}</div>
              <div className="text-xs text-zinc-400">{p.trackCount} tracks</div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          variant="spotify"
          disabled={!selected || submitting}
          onClick={async () => {
            if (!selected) return;
            setSubmitting(true);
            try {
              await onSubmit(selected);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Submitting…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
