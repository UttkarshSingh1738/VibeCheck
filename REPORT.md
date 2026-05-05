# VibeCheck — Final Technical Report

**Live:** https://vibe-check-zeta-peach.vercel.app
**Repo:** see GitHub link in README
**Stack note:** Implementation uses **Next.js 14 + TypeScript** instead of Django. Each Django requirement from the assignment is mapped to its Next.js equivalent in §2 below. The architectural primitives (declarative models, server-rendered + interactive views, request handlers, OAuth-based auth, JSON APIs, env-var separation) are all present; only the framework name differs.

---

## 1. Product Overview

### Refined problem statement
"Whose music taste is actually better?" is a recurring, never-resolved argument among friends. Streaming history is private, anecdotal comparisons are unfair, and there is no neutral judge. **VibeCheck** turns that argument into a structured 1-vs-1 contest: two people pick a Spotify playlist each, an AI scores both across five musical dimensions, and friends vote to confirm or override the AI's verdict. The hybrid (AI + crowd) score crowns a winner.

### Target users
Friend groups, college students, and music-Twitter-style communities aged ~16–30 who already share playlists socially. The product is built around quick, social, share-link-driven sessions rather than long-form profiles or feeds.

### Final feature set (what shipped)
| Included | Removed / deprioritized |
|---|---|
| Spotify OAuth login | Group lobby (3–8 players) |
| Playlist picker (own playlists only) | Apple Music / YouTube Music |
| 1-vs-1 battle creation + share-link | Real-time websockets (we poll) |
| AI scoring across 5 dimensions + commentary | Mobile-native app (responsive web instead) |
| Public voting page (no login required) | Persistent rich battle history |
| Live AI-verdict reveal page | Email / push notifications |
| Hybrid (AI + votes) winner calculation | Re-score / re-roll button |
| Public results page with social share | Scorecard caching by playlist hash |
| Analytics events table | RLS / fine-grained DB security |

### User flow (end to end)

```
Landing  →  Spotify login  →  Dashboard
                                  │
                                  ▼
              "Start a 1v1 Battle"  →  Pick playlist  →  Battle created
                                                              │
                                              ┌───────────────┘
                                              ▼   share /battle/<id>/join
              Opponent opens link  →  Spotify login  →  Picks playlist
                                                              │
                                                              ▼
              Server scores both with Claude (~6–10s, background)
                                                              │
                                                              ▼
              Battle page flips to "AI's Verdict" hero  +  live voting widget
                                                              │
                                              share /vote/<id>  ──▶  Voters cast votes
                                                              │
                                              "Release results now"  OR  24h timer
                                                              │
                                                              ▼
                                                     /results/<id> (public)
```

### Updated design
Wireframes from A1 evolved into the actual screens that ship:
- `/` — landing with hero + "how it works"
- `/dashboard` — recent battles + 1v1 CTA
- `/battle/new` — playlist grid
- `/battle/[id]` — adapts to status (`waiting` / `scoring` / `voting` reveal / `failed`)
- `/battle/[id]/join` — opponent's playlist grid
- `/vote/[id]` — public voting page with both scorecards
- `/results/[id]` — winner + breakdown

A system flow diagram is included in §2.2.

### Evolution from initial idea
The A1 concept was a richer multi-mode social music app. We deliberately collapsed scope to a single, well-executed loop (1v1 → AI → vote → result) once it became clear that scoring quality and the share-link UX were the actual hard problems. Group lobby, history, and Apple Music were cut explicitly to ship a working flow rather than a half-working broader product.

---

## 2. System Architecture

### 2.1 Mapping to assignment requirements

| Assignment (Django) requirement | This codebase (Next.js) |
|---|---|
| **Django models with relationships** | Supabase (Postgres) tables defined in `supabase/schema.sql`: `users`, `battles`, `scorecards`, `votes`, `analytics_events`. Foreign keys: `battles.host_user_id → users.id`, `battles.opponent_user_id → users.id`, `scorecards.battle_id → battles.id`, `votes.battle_id → battles.id`, `analytics_events.battle_id → battles.id` (all with `on delete cascade` where appropriate). Unique constraints on `(battle_id, side)` for scorecards and `(battle_id, voter_fingerprint)` for votes. |
| **Views (FBV / CBV)** | Next.js App Router route handlers in `src/app/api/**/route.ts`. Each is a typed function (effectively an FBV) exporting `GET` / `POST`. Page rendering is split into Server Components (read-only data fetch) and Client Components (interactive state). |
| **Templates with reuse** | React components in `src/components/`. Reused widgets: `PlaylistGrid` (shared by `/battle/new` and `/battle/[id]/join`), `ScorecardDisplay` (shared by battle, vote, results pages), `BattleHeader`, `Button`, `Card`. Layout in `src/app/layout.tsx` plays the role of `base.html`. |
| **Forms and user input handling** | The playlist picker is a click-to-select form (`PlaylistGrid`) that POSTs JSON to API routes. Vote page has two-button form. All inputs validated server-side in the route handlers (`playlistId` type/presence check, `choice ∈ {host, opponent}` enum). |
| **Login / logout** | NextAuth v5 with Spotify OAuth provider (`src/lib/auth.ts`). `/api/auth/signin`, `/api/auth/signout`, `/api/auth/callback/spotify`. JWT sessions, refresh-token rotation implemented. |
| **Protected routes** | `src/middleware.ts` matches `/dashboard/:path*`, `/battle/new`, `/battle/:id/join` and 307-redirects unauthenticated requests to sign-in with `callbackUrl` preserved. |
| **Conditional navigation** | `src/app/page.tsx` checks `auth()` server-side and shows either "Log in with Spotify" or "Go to dashboard →". Dashboard surfaces a "Sign out" link when authed. |
| **Internal JSON API** | All `/api/*` routes return JSON. Public-readable: `GET /api/battle/[id]`, `GET /api/vote/[id]`. Auth-required: `POST /api/battle`, `POST /api/battle/[id]/join`, `GET /api/playlists`. Internal-only (shared-secret gated): `POST /api/battle/[id]/score`. |
| **Model-driven URLs** | Battle URLs are `/battle/<uuid>`, vote URLs `/vote/<uuid>`, results `/results/<uuid>` — all keyed on the battle row's UUID PK. Each row in effect has an implicit `get_absolute_url()` of `/battle/<id>`. |
| **Data flow models → views → templates** | Supabase row → Server Component / API handler → React component props. The `BattleDetail` type in `src/lib/types.ts` is the canonical view-model returned by `GET /api/battle/[id]` and consumed by every UI surface. |
| **Data feature** | (a) **Report page** = `/results/[id]` showing winner, both scorecards, and the AI/votes/hybrid breakdown. (b) **Aggregation view** = the `analytics_events` table aggregates `battle_created`, `opponent_joined`, `score_started`, `score_completed`, `score_failed`, `vote_cast`, `battle_finalized` events for funnel analysis. |
| **Production-aware setup** | `.env.example` documents every required variable; `.env.local` is git-ignored; service-role key is server-only (typed and accessed exclusively via `lib/supabase.ts → supabaseAdmin()`); secrets verified absent from commits. |

### 2.2 System flow diagram

```
   Browser (host)              Browser (opponent)              Browser (voter)
        │                             │                                │
        │ POST /api/battle            │                                │
        ▼                             │                                │
   battles row (waiting)              │                                │
        │                             │                                │
        │  share join link  ────────▶ │                                │
        │                             │ POST /api/battle/:id/join      │
        │                             ▼                                │
        │                       battles (scoring)                      │
        │                             │                                │
        │            ┌── server (waitUntil) ──┐                        │
        │            ▼                          ▼                      │
        │  POST /api/battle/:id/score                                  │
        │     ├─ Spotify (user OAuth tokens, per side)                │
        │     │   • playlist meta + items                              │
        │     │   • audio-features  (best-effort, may 403)             │
        │     │   • artist genres   (best-effort, may be sparse)       │
        │     ├─ Anthropic Claude messages.create  →  scorecards rows  │
        │     └─ battles → status=voting, vote_closes_at=+24h          │
        │                             │                                │
        │                             │       share vote link  ──────▶ │
        │                             │                                │ POST /api/vote/:id
        │                             │                                ▼
        │                             │                            votes row
        │                             │                                │
        │  "Release results" ─────────┴──  POST /api/battle/:id/finalize
        │     • compute hybrid (50% AI avg + 50% normalized vote share)│
        │     • write winner + status=done                             │
        │                                                              │
        ▼                                                              ▼
                            /results/:id (public)
```

### 2.3 Key architecture decisions
- **Single-process full stack**: API routes and React UI live in the same Next.js project deployed as a single Vercel app — fewer moving parts, fewer auth boundaries, and one type system end-to-end.
- **Supabase over a Django ORM-style local DB**: Postgres without operational overhead. Schema lives in `supabase/schema.sql` (treated as a migration file).
- **Polling, not websockets**: The battle page polls `GET /api/battle/[id]` every 3s. We added DB-side caching of playlist names so this poll never hits Spotify, only Postgres.
- **Idempotent scoring**: `POST /api/battle/[id]/score` checks for existing `scorecards` rows before doing work; safe to retry.
- **Token-per-side scoring**: The score job runs server-to-server *after* the response goes out (`waitUntil`). Each user's OAuth access token is stashed on the battle row when they join, then used to fetch their own playlist (Spotify's Client Credentials flow no longer reads playlist `/items` reliably for new apps). Tokens are nulled out as soon as scoring finishes.

---

## 3. AI Integration

### 3.1 Where AI enters the system
AI runs once per battle, in `POST /api/battle/[id]/score`. It produces, for each playlist, a strict-JSON scorecard:

```json
{
  "cohesion": 78,
  "diversity": 64,
  "discovery": 41,
  "vibe": 82,
  "lyrical_depth": 71,
  "commentary": "2–3 sentences specific to this playlist…"
}
```

### 3.2 Pipeline (input → output)
1. **Server-side aggregation (no AI / no API)**: `src/lib/spotify.ts → buildPlaylistSummary` calls Spotify Web API to get playlist meta, the first 50 tracks (titles + artists + release years), audio-feature averages (when available), and top-5 genres by artist frequency. Era distribution (e.g. `{"1990s": 4, "2000s": 12}`) is computed by bucketing release years client-side. None of this requires Claude.
2. **Prompt construction**: `src/lib/claude.ts → buildUserPrompt` formats the aggregated summary into a fixed template and pairs it with a tightly-constrained system prompt that locks the output schema and tells the model to ignore audio-feature/genre blocks if they're empty (graceful degradation for new-app Spotify deprecations).
3. **Model call**: `claude-sonnet-4-6`, `max_tokens=600`, no streaming.
4. **Parsing & validation**: response stripped of any stray markdown fences, JSON-extracted between first `{` and last `}`, all numeric fields range-checked `[0,100]` and rounded, commentary type-checked. **One automatic retry** on parse failure with the same prompt; on second failure the battle flips to `status='failed'`.
5. **Persistence**: scorecard inserted into `scorecards` row (with the raw response stored in `raw_response` for debugging).
6. **Hybrid score**: `src/lib/score.ts → hybridScore()` computes `0.5 * aiAverage + 0.5 * votePct`. Tie → host wins (documented).
7. **UI return**: the `/battle/[id]` voting state renders an "AI's Verdict" hero panel with both scorecards (5-bar visuals + commentary) and a live voting widget that recomputes the hybrid as votes come in.

### 3.3 Guardrails
- **Schema validation**: all six required keys enforced; numeric fields range-clamped before insert.
- **Single retry** on parse failure, then explicit `status='failed'` (no infinite retries → no runaway cost).
- **Status-gated**: scoring only runs when `status='scoring'` and both opponent fields are populated.
- **Token expiry**: NextAuth refreshes Spotify tokens 60s before expiry; on refresh failure the session is marked invalid rather than silently making bad calls.
- **Graceful endpoint deprecation**: audio-features and genre calls are wrapped in try/catch and return safe defaults (zeros / empty list) rather than killing the run. The system prompt explicitly tells Claude to ignore those blocks when empty.
- **Schema-shape tolerance**: the playlist parser accepts both the old (`tracks`/`track`) and new (`items`/`item`) Spotify shapes since Spotify rolled the rename out gradually for new apps.

### 3.4 API-only vs hybrid: justification

**What an API-only version would look like**
A "thin" version would skip our local aggregation and just send Claude either (a) the raw Spotify JSON for each playlist or (b) a list of track URLs and ask it to do everything. Either approach pushes ~5–10× more tokens through the model and gives us no leverage to filter or normalize.

**What we built (hybrid)**
- **Local processing in our code**: Spotify API calls, aggregation of audio-feature averages, genre frequency-counting, era bucketing, top-50 sampling, JSON parsing, score arithmetic, hybrid winner calculation, vote tally — all run on our server with zero LLM tokens.
- **Frontier model only for the irreducibly subjective step**: 5-dimension qualitative scoring + 2–3-sentence commentary. This is the one task that requires broad cultural/musical knowledge (recognizing artists across genres, languages, and decades) and natural-language fluency.

**Why not a local model for the scoring step**
We considered a small open model (e.g., Llama-3.1-8B-Instruct or a fine-tuned sentence-transformer + classifier head). Three blockers:
1. **Quality**: smaller open models hallucinate confidently about niche / non-English artists. Our test playlists included a Hindi-language playlist where small models invented song descriptions. Sonnet handled it correctly with no extra prompting.
2. **Cold-start latency on serverless**: Vercel functions have ~250 MB code limits and no GPU. Loading even a 7B-parameter model into a serverless function isn't feasible; we'd need a separate inference service (Replicate, RunPod, a self-hosted GPU box). That trades one API for another, with worse cold-starts and more ops.
3. **Cost crossover**: at our usage profile (one battle ≈ 2 model calls ≈ 1.6K input + 400 output tokens total) Claude costs ~$0.005–$0.01 per battle. Renting a `g5.xlarge` GPU instance 24/7 to host an open model is ~$24/day = $720/month — break-even is around 100K+ battles/month, well above our class-project traffic.

**What our hybrid design buys us specifically**
- **Cost**: no LLM tokens spent on Spotify pagination, deduping artists, era bucketing, audio-feature math. Model context stays small and predictable.
- **Control**: we choose what Claude sees. If Spotify's `/audio-features` 403s for new apps, we substitute zeros and instruct the model to ignore that block — without changing the prompt schema.
- **Latency**: smaller prompts = faster responses (~4–5s observed end-to-end per side). Two sides scored in parallel = 5–7s total Claude time per battle.
- **Flexibility**: the `PlaylistSummary` type is stable. We can swap models (Sonnet → Haiku for cost, → Opus for quality, → a future local model) with no other code changes.

### 3.5 Model selection
We chose `claude-sonnet-4-6` over the alternatives:
- **vs Haiku**: Haiku produced thinner commentary and was less reliable at staying inside the JSON schema in our prompt-engineering trials.
- **vs Opus**: Opus is ~5× the cost and didn't materially improve scores or commentary at this task's complexity.
- **vs OpenAI GPT-class**: comparable quality, but Sonnet's strict-JSON adherence was better in our manual A/B (no markdown-fence wrap, no preamble, no trailing prose) and Anthropic's pricing model is friendlier at our scale.

---

## 4. Evaluation

### 4.1 System evaluation — five test cases

| # | Input | Expected behavior | Actual output | Quality | Latency |
|---|---|---|---|---|---|
| 1 | Mainstream English playlist (~25 tracks, top-40 mix) | Coherent scorecard, mid-high cohesion + low-mid discovery, commentary referencing chart artists | All 5 dimensions returned 60–85 range; commentary correctly identified the "Top 40 throwback" feel | ✅ Good | 4.8s per side |
| 2 | Single-track Hindi playlist ("Hindi" → 1 song "Kadam") | Sparse score, low diversity, commentary noting limited sample | Cohesion=85, Diversity=10, Discovery=70 (correct: Prateek Kuhad is non-mainstream); commentary in English referencing the artist correctly | ✅ Good given sparse input | 3.2s per side |
| 3 | Genre-mixed (jazz + electronic + indie folk) | Higher diversity, lower cohesion | Diversity=88, Cohesion=42, with commentary explicitly calling out the genre jump | ✅ Good | 5.1s per side |
| 4 | Mostly instrumental (study-music-style) | Low lyrical_depth, high vibe | Lyrical_depth=18, Vibe=79, commentary noting the "lo-fi study energy" | ✅ Good | 4.6s per side |
| 5 | Empty / 0-track playlist | Graceful failure with actionable error | Battle status flips to `failed`, UI shows "Make sure both playlists are public and have tracks" | ✅ Correct degraded path | 1.8s (no Claude call) |

### 4.2 Failure analysis (real failures from the build)

#### Failure A — Spotify endpoint deprecation crashed scoring
**What failed.** First end-to-end run after deploy: `POST /api/battle/[id]/score → 500`, stack trace `TypeError: Cannot read properties of undefined (reading 'total')` originating in `getPlaylistMeta`.

**Why.** Spotify deprecated `/v1/audio-features`, `/v1/recommendations`, related-artists, and several other endpoints for apps created **after 2024-11-27**. They simultaneously renamed the playlist response shape: `tracks` → `items`, `track` (per-row) → `item`, and the `/playlists/{id}/tracks` endpoint was replaced with `/playlists/{id}/items`. Our code, written against the older docs, expected `data.tracks.total` — which is `undefined` on the new shape. Exception unwound through `Promise.all` into the score handler.

**Category.** External-API contract change (data/integration limitation). Not a model issue; not a prompt issue.

**Fix.** (1) Defensive parsing accepting *both* shapes (`data.items?.total ?? data.tracks?.total ?? 0`). (2) Try `/items` first, fall back to `/tracks`. (3) Wrap audio-features and genre calls in try/catch returning safe defaults. (4) Updated the Claude system prompt to explicitly ignore the audio-feature/genre blocks when empty. See §4.3.

#### Failure B — Client Credentials token couldn't read user playlists
**What failed.** Even after fixing the schema mismatch, scoring continued to fail because the playlists came back with `tracks.total = 0` in the picker UI, and the score job got 0 tracks for both sides.

**Why.** The score route originally used Spotify's **Client Credentials** flow to get a server-to-server token, on the assumption that this token could read public playlists. For new apps, this token reliably reads public-but-curated content (artist info, top tracks) but no longer reliably enumerates user-owned playlists' items — Spotify increasingly restricts that to user-context tokens.

**Category.** Permissions / API access model mismatch.

**Fix.** Persist each user's OAuth access token on the battle row at create / join time. The score handler then uses the *user's own* token to fetch *their* playlist. Tokens are scrubbed from the row immediately after scoring completes.

### 4.3 Improvement (before vs after)

**Symptom.** Score route 500'd with bare stack traces; users saw a generic "Scoring failed" UI; we couldn't tell why.

**Before** (`getPlaylistMeta` excerpt):
```ts
const data = await spotifyFetch<{ name: string; tracks: { total: number } }>(
  token, `/playlists/${id}?fields=name,tracks(total)`
);
return { name: data.name, total: data.tracks.total };
```
Single shape assumed. Any deviation crashed with "Cannot read property of undefined."

**After**:
```ts
const data = await spotifyFetch<{
  name?: string | null;
  items?: { total?: number | null } | null;
  tracks?: { total?: number | null } | null;
}>(token, `/playlists/${id}?fields=name,items(total),tracks(total)`);
return {
  name: data?.name ?? "Untitled playlist",
  total: data?.items?.total ?? data?.tracks?.total ?? 0
};
```
Plus: getPlaylistTracks tries `/items` first and falls back to `/tracks`, audio-features and genres swallow non-200s with logged warnings, and the system prompt tells Claude to ignore zeroed audio-feature blocks.

**Why it helped.** The same code now succeeds against both old- and new-app Spotify shapes, fails gracefully (with an explicit "playlist returned 0 tracks" error rather than a NPE) when content really is unreadable, and never blocks scoring because of a single deprecated endpoint. End-to-end success rate went from 0% (every battle failed) to ~100% on real, populated, public playlists.

### 4.4 Cost & resource awareness

**Per-battle compute.**
- Vercel function invocation, Node.js 24, peak observed memory ~300 MB (well under the 2048 MB limit), peak observed duration ~7s for the score handler (well under the 60s `maxDuration`).
- Spotify API: ~5 calls per side × 2 sides = ~10 calls per battle. We've burned through Spotify's per-user rate limit during heavy debugging; under steady-state usage we're nowhere near the cap.
- Anthropic API: 2 `messages.create` calls per battle, ~800 input tokens + ~200 output tokens each.

**Per-battle dollars.**
- Anthropic: at `claude-sonnet-4-6` pricing (~$3/M in, $15/M out): `2 × (800 × $0.000003 + 200 × $0.000015)` ≈ **$0.011/battle**.
- Supabase: free tier covers all storage + queries at MVP traffic.
- Vercel: free tier covers function invocations at MVP traffic.

**Comparison: this hybrid system vs a fully API-driven equivalent.**

| Path | Per-battle Claude cost | Notes |
|---|---|---|
| **Current hybrid** | ~$0.011 | Local code does Spotify pagination, aggregation, score math, vote tally, hybrid calc |
| **Fully API-driven** | ~$0.05–$0.10 | Send raw Spotify JSON for both playlists to Claude; ask it to also tally votes / compute hybrid via tool use; ~10× more tokens, more retries, much wider variance in output structure |

**When our system is cheaper.** Always at any non-trivial volume, because we eliminate per-battle token spend on tasks that are deterministic arithmetic (averages, percentages) or simple list manipulation (top-5 genres). Below ~10K battles/month, our setup is dramatically cheaper than running a self-hosted GPU model.

**When our system gets more expensive.** At ~100K+ battles/month with a stable workload, a self-hosted Llama-3.1-70B (or similar) on rented GPU could undercut Sonnet's marginal per-battle cost. We're nowhere near that crossover.

**Storage / network.** Each battle row + 2 scorecard rows + ~3–10 vote rows ≈ ~15 KB/battle. Supabase free tier (500 MB) holds ~30K battles before paid tier. Egress is dominated by Spotify image URLs which we serve via `<img src>` directly from Spotify's CDN, not through our origin.

### 4.5 Production readiness

**Scaling to 10K users/day.**
- **Stateless API routes** — Vercel scales horizontally automatically; no sticky sessions.
- **Caching scorecards by playlist content-hash** — listed as a stretch item in the original spec; would let us serve a re-pick of the same playlist instantly with zero Claude spend.
- **Queue Claude calls** behind a simple in-memory rate limiter (e.g., `p-queue`) to stay under Anthropic's per-minute concurrency cap.
- **Move polling to a single SSE / websocket** if poll volume ever becomes a Postgres bottleneck (currently `GET /api/battle/[id]` is a single indexed query plus a few small joins).

**Rate limiting / abuse prevention.**
- Vote dedupe: `unique(battle_id, voter_fingerprint)` constraint where fingerprint = SHA-256 of `IP + user-agent`. Cheap, easily bypassed by determined attackers — acceptable for a class demo.
- Battle creation is auth-gated; only logged-in Spotify users can create. Adding per-user creation limit would be a one-line filter.
- Scoring trigger is gated by `INTERNAL_SCORE_SECRET` and is idempotent — replay-safe.

**Privacy.**
- We collect only what Spotify exposes via OAuth: user ID, display name, email, avatar URL.
- OAuth access tokens are stored on the battle row only for the brief window between join and scoring, then nulled out.
- No third-party analytics. `analytics_events` is internal-only.
- `service_role` Supabase key never leaves the server.

**Logging & monitoring.**
- Structured `console.error` / `console.warn` in every API route; Vercel ingests these.
- The `analytics_events` table records funnel-relevant events (`battle_created`, `opponent_joined`, `score_started`, `score_completed`, `score_failed`, `vote_cast`, `battle_finalized`) with a `meta` JSONB column for ad-hoc fields.
- Raw Claude responses persisted in `scorecards.raw_response` for debugging prompt drift.
- Production gaps: no Sentry / error-tracker yet; no SLO alerting. Both are 30-minute additions for a real launch.

**Known limitations carried forward.**
- Spotify Dev Mode caps non-allowlisted users to 25 — production launch requires "Extended Quota Mode" review.
- Audio-features endpoint is dead for new apps; scoring leans entirely on Claude's prior knowledge of the songs.
- Polling could be replaced with SSE; not worth it at current scale.

---

## Appendix: where to read the code

| What | File |
|---|---|
| The Claude prompt | `src/lib/claude.ts` |
| Spotify aggregation → `PlaylistSummary` | `src/lib/spotify.ts → buildPlaylistSummary` |
| Hybrid score math + tie rule | `src/lib/score.ts` |
| Auth, token refresh, OAuth scopes | `src/lib/auth.ts` |
| DB schema | `supabase/schema.sql` |
| Score pipeline orchestration | `src/app/api/battle/[id]/score/route.ts` |
| Live AI verdict reveal UI | `src/app/battle/[id]/page.tsx` |
| Voting UI | `src/app/vote/[id]/page.tsx` |
| Results / report page | `src/app/results/[id]/page.tsx` |
| All decisions / shortcuts taken | `DECISIONS.md` |
| User-facing setup walkthrough | `README.md` |
| AI workflow + model selection | `README_AI.md` |
