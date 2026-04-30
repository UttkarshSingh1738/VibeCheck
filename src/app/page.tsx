import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function LandingPage() {
  const session = await auth();
  const loggedIn = Boolean(session);

  return (
    <main className="mx-auto max-w-3xl py-16 text-center">
      <h1 className="text-5xl font-bold tracking-tight">
        Whose music taste is <span className="text-spotify">actually</span> better?
      </h1>
      <p className="mt-4 text-lg text-zinc-300">
        Pick a playlist. Claude scores it. Your friends pick the winner.
      </p>

      <div className="mt-10 flex justify-center">
        {loggedIn ? (
          <Link
            href="/dashboard"
            className="rounded-full bg-white px-6 py-3 font-semibold text-black hover:bg-zinc-200"
          >
            Go to dashboard →
          </Link>
        ) : (
          <Link
            href="/api/auth/signin?callbackUrl=/dashboard"
            className="rounded-full bg-spotify px-6 py-3 font-semibold text-black hover:brightness-110"
          >
            Log in with Spotify
          </Link>
        )}
      </div>

      <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
        {[
          { t: "1. Pick", d: "Choose one of your Spotify playlists." },
          { t: "2. Score", d: "Claude rates it across 5 dimensions." },
          { t: "3. Vote", d: "Friends vote. Hybrid score crowns a winner." }
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="text-sm font-semibold text-spotify">{c.t}</div>
            <div className="mt-1 text-sm text-zinc-300">{c.d}</div>
          </div>
        ))}
      </div>

      <footer className="mt-20 text-xs text-zinc-500">
        VibeCheck — class project. <a href="https://github.com/" className="underline">GitHub</a>
      </footer>
    </main>
  );
}
