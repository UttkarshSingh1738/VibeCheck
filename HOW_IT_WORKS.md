# How VibeCheck Works

A short architecture + user-flow walkthrough. For setup, see [README.md](./README.md). For shortcuts taken, see [DECISIONS.md](./DECISIONS.md).

---

## The user story

1. **Host** logs in with Spotify on the landing page → lands on `/dashboard`.
2. Host clicks **Start a 1v1 Battle**, picks a playlist on `/battle/new`, and clicks **Create**.
   - This `POST /api/battle` inserts a row in `battles` with `status='waiting'`.
   - Host is redirected to `/battle/[id]` and sees a **shareable join link**.
3. **Opponent** opens the join link → logs in with Spotify (NextAuth handles redirect-back) → picks a playlist on `/battle/[id]/join`.
   - `POST /api/battle/[id]/join` updates the row with the opponent's user + playlist + sets `status='scoring'`.
   - It then fires-and-forgets `POST /api/battle/[id]/score` (with a shared internal secret) so the request returns instantly.
4. **Scoring pipeline** runs server-side (≈10–30s):
   - Get a Spotify *client-credentials* token (server-to-server).
   - For each side, call Spotify Web API: playlist meta, up to 50 tracks, audio-features for those tracks, artist genres.
   - Aggregate into a `PlaylistSummary` (genres top-5, era buckets like `1990s`, audio-feature averages).
   - Send each summary to Claude with a strict-JSON system prompt.
   - Parse + validate, store as a `scorecards` row.
   - When both sides are stored: `status='voting'` and `vote_closes_at = now + 24h`.
5. **Voters** open `/vote/[id]` (no auth) and see both scorecards side by side. They click their winner.
   - `POST /api/vote/[id]` hashes `IP + user-agent` to a fingerprint and inserts into `votes`. The `unique(battle_id, voter_fingerprint)` constraint blocks easy double-voting.
6. **Finalize**: either when 24h elapses *or* a player clicks **Release results now** on the battle page (`POST /api/battle/[id]/finalize`).
   - Computes a **hybrid score** = 50% AI average (mean of the 5 dimensions) + 50% normalized vote share.
   - Higher hybrid wins. Tie → host (documented).
   - Sets `status='done'` and `winner='host'|'opponent'`.
7. **Results** page (`/results/[id]`, public) shows the winner, both scorecards, AI commentary, and the score breakdown.

---

## File map (where to look)

| What you want to change | File |
|---|---|
| The Claude prompt | `src/lib/claude.ts` |
| What gets sent to Claude (the playlist summary) | `src/lib/spotify.ts` → `buildPlaylistSummary` |
| Hybrid scoring math + tie rule | `src/lib/score.ts` |
| Auth / Spotify scopes / user upsert | `src/lib/auth.ts` |
| DB shape | `supabase/schema.sql`, types in `src/lib/types.ts` |
| Landing copy / hero | `src/app/page.tsx` |
| Battle status UI | `src/app/battle/[id]/page.tsx` |
| Voting UI | `src/app/vote/[id]/page.tsx` |
| Results layout | `src/app/results/[id]/page.tsx` |

---

## Data flow at a glance

```
   Browser A (host)              Browser B (opponent)              Browser C (voter)
        │                              │                                  │
        │ POST /api/battle             │                                  │
        ▼                              │                                  │
   battles (waiting)                   │                                  │
        │                              │                                  │
        │  share link  ───────────────▶│                                  │
        │                              │ POST /api/battle/:id/join        │
        │                              ▼                                  │
        │                       battles (scoring)                         │
        │                              │                                  │
        │           ┌──── server ──────┴── fire & forget ──┐              │
        │           ▼                                       ▼              │
        │  /api/battle/:id/score                                          │
        │     ├─ Spotify (client_credentials)                             │
        │     │   • playlist tracks                                       │
        │     │   • audio features                                        │
        │     │   • artist genres                                         │
        │     ├─ Claude messages.create  →  scorecards rows               │
        │     └─ battles → status=voting, vote_closes_at=+24h             │
        │                              │                                  │
        │                              │       share vote link  ─────────▶│
        │                              │                                  │ POST /api/vote/:id
        │                              │                                  ▼
        │                              │                              votes row
        │                              │                                  │
        │  Release results now ────────┴── POST /api/battle/:id/finalize  │
        │     • compute hybrid (50% AI + 50% vote share)                  │
        │     • write winner + status=done                                │
        │                                                                 │
        ▼                                                                 ▼
                            /results/:id (public)
```

---

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/playlists` | session | list current user's owned playlists |
| POST | `/api/battle` | session | create battle as host |
| GET | `/api/battle` | session | last 5 of user's battles |
| GET | `/api/battle/:id` | none | full battle detail (used by all client pages) |
| POST | `/api/battle/:id/join` | session | opponent submits playlist; triggers scoring |
| POST | `/api/battle/:id/score` | shared secret header | server-to-server scoring trigger (idempotent) |
| POST | `/api/battle/:id/finalize` | none | compute winner if scorecards exist |
| GET | `/api/vote/:id` | none | current tally |
| POST | `/api/vote/:id` | none (fingerprinted) | cast a vote |

---

## What's intentionally out of scope (MVP)

- Group lobby (3–8 players)
- Real-time updates — we poll every 3s on the battle page
- Apple Music / YouTube Music
- Robust vote dedupe — IP+UA hash is trivially bypassable
- Mobile app — responsive web only
- Tests — only the spec'd happy-path integration test is recommended

See `DECISIONS.md` for shortcuts and the rationale behind each.
