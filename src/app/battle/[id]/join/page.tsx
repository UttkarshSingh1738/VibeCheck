"use client";
import { useParams, useRouter } from "next/navigation";
import { PlaylistGrid } from "@/components/PlaylistGrid";

export default function JoinBattlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  async function submit(playlistId: string) {
    const res = await fetch(`/api/battle/${id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlistId })
    });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Failed to join: ${res.status} ${txt}`);
      return;
    }
    router.push(`/battle/${id}`);
  }

  return (
    <main className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-semibold">You’ve been challenged</h1>
        <p className="text-sm text-zinc-400">Pick your playlist to lock in.</p>
      </header>
      <PlaylistGrid onSubmit={submit} submitLabel="Join battle" />
    </main>
  );
}
