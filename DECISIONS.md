# Decisions / Deviations from the Spec

Things that diverge from `VibeCheck_Build_Spec.md`, plus shortcuts taken to keep the MVP small.

## Model
- Spec: `claude-sonnet-4-5`. Used: `claude-sonnet-4-6` (current Sonnet at the time of writing). Swap the constant in `src/lib/claude.ts` if needed.

## Spotify token used during scoring
- The scoring pipeline runs server-to-server (no user session present), so we use the **Client Credentials** flow to get a token. That token can only read **public** playlists.
- Implication: if a user picks a *private* playlist, scoring will fail with a Spotify 4xx and the battle goes to `status='failed'`. The UI shows a clear message asking the user to make their playlist public.
- A fuller fix would be to persist user OAuth tokens (with refresh) and use the host's / opponent's own token during scoring. Out of scope for the MVP.

## RLS off
- Per spec: row-level security is **not** enabled on Supabase tables. All writes go through server routes using the `SUPABASE_SERVICE_ROLE_KEY`. Don't deploy this without adding RLS first.

## Internal scoring trigger
- `/api/battle/[id]/score` is gated by `INTERNAL_SCORE_SECRET` (env var) sent in `x-internal-secret` header. The opponent-join route fires it server-to-server. Anyone hitting that route without the secret is rejected.

## Track cap = 50
- Per spec. We send up to 50 tracks to both Spotify (audio-features endpoint max) and Claude (prompt budget). Larger playlists are still scored — just sampled.

## Tie rule
- If hybrid scores tie exactly, **host wins**. Encoded in `pickWinner()` in `src/lib/score.ts`.

## Vote dedupe
- `votes.voter_fingerprint = sha256(ip + user-agent)`. Cheap and easily bypassed. Acceptable for the MVP per spec; the spec already lists "better fingerprinting" as a stretch item.
- We *also* set a `localStorage` key on the vote page so the UI shows the user as having voted. This is purely cosmetic; the DB unique constraint is the source of truth.

## Polling, not websockets
- The host's battle page polls `/api/battle/[id]` every 3 seconds. Simple, good enough for a class demo.

## Playlist-name lookup on the battle detail
- `GET /api/battle/:id` does a best-effort fetch of playlist names using whatever Spotify access token the requester happens to have. If they don't have one (e.g., a public voter), the UI falls back to showing the raw Spotify playlist ID.

## Components / state
- No Redux/Zustand; pages own their own state with `useState`/`useEffect`. Per spec.

## NextAuth v5 (beta)
- v5 is a beta but is what the spec calls for. The handler is exported from `src/lib/auth.ts` and re-exported by `src/app/api/auth/[...nextauth]/route.ts`.

## Tests
- None in the repo yet. Spec says "don't add tests beyond a single happy-path integration test for the scoring pipeline." That one test is also not present — TODO if there's time.

## Stretch items intentionally skipped
- Scorecard caching by playlist content-hash
- Re-score button
- Group lobby mode
- Persistent battle history beyond the dashboard list
- Email/push notifications
- Better vote dedupe
