import Link from "next/link";
import { auth, getCurrentDbUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export default async function DashboardPage() {
  const session = await auth();
  const user = await getCurrentDbUser();
  const name = (session?.user?.name as string | undefined) ?? user?.display_name ?? "friend";

  let recent: Array<{ id: string; status: string; winner: string | null; created_at: string }> = [];
  if (user) {
    const { data } = await supabaseAdmin()
      .from("battles")
      .select("id,status,winner,created_at")
      .or(`host_user_id.eq.${user.id},opponent_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(5);
    recent = data ?? [];
  }

  return (
    <main className="space-y-10 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hey {name} 👋</h1>
        <Link href="/api/auth/signout" className="text-sm text-zinc-400 hover:text-white">
          Sign out
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/battle/new"
          className="rounded-2xl border border-spotify/40 bg-spotify/10 p-6 transition hover:border-spotify"
        >
          <div className="text-sm font-medium uppercase tracking-wide text-spotify">Active</div>
          <div className="mt-2 text-xl font-semibold">Start a 1v1 Battle</div>
          <div className="mt-1 text-sm text-zinc-300">
            Pick a playlist, share the link, get judged.
          </div>
        </Link>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 opacity-60">
          <div className="text-sm font-medium uppercase tracking-wide text-zinc-400">Soon</div>
          <div className="mt-2 text-xl font-semibold">Group Lobby (3–8)</div>
          <div className="mt-1 text-sm text-zinc-400">Coming soon.</div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Recent battles
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No battles yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
            {recent.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-mono text-sm">{b.id.slice(0, 8)}…</div>
                  <div className="text-xs text-zinc-500">{new Date(b.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs uppercase tracking-wider text-zinc-300">
                    {b.status}
                  </span>
                  <Link
                    href={b.status === "done" ? `/results/${b.id}` : `/battle/${b.id}`}
                    className="text-sm text-spotify hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
