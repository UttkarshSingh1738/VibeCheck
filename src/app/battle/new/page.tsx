"use client";
import { useRouter } from "next/navigation";
import { PlaylistGrid } from "@/components/PlaylistGrid";

export default function NewBattlePage() {
  const router = useRouter();

  async function createBattle(playlistId: string) {
    const res = await fetch("/api/battle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlistId })
    });
    if (!res.ok) {
      alert(`Failed to create battle (${res.status})`);
      return;
    }
    const data = await res.json();
    router.push(`/battle/${data.battleId}`);
  }

  return (
    <main className="space-y-6 py-6">
      <header>
        <h1 className="text-2xl font-semibold">Pick your playlist</h1>
        <p className="text-sm text-zinc-400">
          You’ll get a shareable link to send to your opponent.
        </p>
      </header>
      <PlaylistGrid onSubmit={createBattle} submitLabel="Create battle" />
    </main>
  );
}
