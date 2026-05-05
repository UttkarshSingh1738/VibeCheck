# VibeCheck — AI Documentation

This document covers the AI subsystem only. For setup, see [README.md](./README.md). For the full assignment writeup, see [REPORT.md](./REPORT.md).

---

## 1. AI workflow

```
                 user picks playlist
                          │
                          ▼
        Spotify Web API (10 calls per battle)
        ├─ /me/playlists                   ← list owned playlists
        ├─ /playlists/{id}                 ← name + total
        ├─ /playlists/{id}/items           ← first 50 tracks (with /tracks fallback)
        ├─ /audio-features?ids=…           ← best-effort, may 403 for new apps
        └─ /artists?ids=…                  ← best-effort top-5 genres
                          │
                          ▼
        Server-side aggregation (no AI):
        src/lib/spotify.ts → buildPlaylistSummary(token, playlistId)
          • track-list sample (≤50)
          • audio-feature averages (or zeros if 403)
          • top-5 genres by frequency
          • era distribution: {"2000s": 12, "2010s": 4, ...}
                          │
                          ▼
        Prompt construction
        src/lib/claude.ts → buildUserPrompt(summary)
          + system prompt locking JSON schema
                          │
                          ▼
        Anthropic Messages API
        model: claude-sonnet-4-6
        max_tokens: 600
        no streaming
                          │
                          ▼
        Strict-JSON parse
          • strip stray ``` fences
          • slice between first { and last }
          • validate 6 required keys
          • clamp numerics to [0,100], round to int
        + 1 automatic retry on parse failure
                          │
                          ▼
        Persist scorecard row in Supabase
        (raw response stored in raw_response for debugging)
                          │
                          ▼
        Hybrid score = 0.5 × AI avg + 0.5 × normalized vote share
        (computed in src/lib/score.ts, runs on every poll)
                          │
                          ▼
        UI renders the "AI's Verdict" hero
        + live voting widget that recomputes hybrid as votes come in
```

---

## 2. Model selection

### Final choice: `claude-sonnet-4-6`

| Candidate | Why we considered it | Why we didn't pick it |
|---|---|---|
| **`claude-sonnet-4-6`** ✅ | Strong music/lyrics knowledge, reliable strict-JSON output, sub-5s latency per call, good price/quality | (chosen) |
| `claude-haiku-4-5` | 3–4× cheaper | Thinner commentary; less reliable JSON adherence in our A/B trials |
| `claude-opus-4-7` | Slightly higher commentary quality | ~5× the cost; marginal quality gain didn't justify spend at our scale |
| GPT-class API | Comparable quality | Sonnet's strict-JSON behavior was cleaner in our trials (no markdown fences, no preamble); single-vendor for simpler ops |
| Local Llama-3.1-8B-Instruct | Zero per-call cost, full control | Hallucinated on niche artists (especially non-English — our Hindi playlist test broke it); requires a GPU box, no serverless option; adds infra ops |
| Local sentence-transformer + classifier head | Cheap, deterministic | Doesn't generate prose commentary, which is half the product value |

### Why an LLM at all (vs purely heuristic scoring)
Audio-feature averages alone (energy, valence, tempo) can mechanically score "vibe consistency" but not:
- Whether the tracks belong to a recognizable cultural moment / aesthetic (cohesion)
- Whether the curator picked obscurities vs charts (discovery)
- Whether the lyrics carry weight vs being filler (lyrical depth)
- Natural-language commentary that's actually fun to read

Those four require world knowledge about specific songs and artists. That's the LLM's job.

---

## 3. Design decisions

### 3.1 Strict-JSON output, not function-calling
We tell the model to emit a six-key JSON object. We *don't* use Anthropic's tool-use / function-calling wrapper.

**Why:** at this scale the JSON discipline of Sonnet is sufficient and tool-use adds latency + tokens for no quality win. We do tolerate the model wrapping output in ```` ```json ```` fences anyway (we strip them) and slice between first `{` / last `}` to handle stray sentences, then validate.

### 3.2 One retry, then fail loudly
On parse failure we retry once with the same prompt. On the second failure we set `battles.status = 'failed'`, log the raw text, and surface a clear UI message rather than spinning forever.

**Why:** runaway retries on a malformed output = unbounded cost and indefinite "scoring…" UI. One retry handles transient blips; second failure is a real signal that needs human inspection.

### 3.3 Server-side aggregation, not "send Spotify JSON to the model"
Everything that's deterministic — audio-feature averaging, genre frequency, era bucketing, top-50 sampling — runs in our Node code. The model only sees a clean compact summary.

**Why:**
- Tokens are dollars. We don't pay LLM tokens to count list lengths.
- Determinism. Average of six floats has one right answer; we don't want a model approximating it.
- Smaller prompts = faster responses (~4–5s vs ~10s+ if we sent raw Spotify JSON).
- The `PlaylistSummary` type is stable, so swapping models is a one-line change.

### 3.4 Graceful degradation when Spotify endpoints break
Spotify deprecated `/v1/audio-features`, `/v1/recommendations`, related-artists, and a few others for apps created after 2024-11-27. Our app is new; we get 403s on those endpoints.

We don't fail the run. Instead:
- `getAudioFeaturesAvg` catches the 403 and returns zeros.
- `getTopGenres` catches the 403 / sparse-data case and returns `[]`.
- The system prompt explicitly says: "If all audio-feature averages are 0 and top genres is empty, ignore those sections entirely and score based on the track list, eras, and your own knowledge of the songs and artists."

### 3.5 Schema-shape tolerance for Spotify's `tracks → items` rename
Spotify renamed the playlist response shape gradually for new apps:
- `data.tracks` → `data.items`
- per-row `it.track` → `it.item`
- endpoint `/playlists/{id}/tracks` → `/playlists/{id}/items` (old returns 403 for new apps)

Our parser accepts both shapes simultaneously: requests both fields in `?fields=`, reads whichever is present, tries the new endpoint first and falls back to the old one. The product runs cleanly on either generation of Spotify app credentials.

### 3.6 Token-per-side scoring
The score handler runs in the background after the join request returns (Vercel `waitUntil`). Because there's no user session in that context, we initially used Spotify's Client Credentials flow — which turned out to no longer reliably enumerate user playlists for new apps.

Fix: on battle creation and on join, we persist each user's OAuth access token on the battle row. The score handler reads those tokens and uses the user's own token to fetch *their own* playlist. Tokens are nulled out as soon as scoring completes.

This matters because:
- It works around the Client Credentials limitation cleanly.
- It uses the minimum-necessary scope (the user already granted `playlist-read-private` on login).
- Tokens have a ~1-hour lifetime and live in the DB only for the few seconds between join and score.

### 3.7 Why we did not build a RAG layer
Considered: embedding all tracks in the playlist with `sentence-transformers`, retrieving similar tracks across playlists, feeding that to Claude as context.

Decided against: the input to scoring is already complete and bounded (≤50 tracks). There is nothing to "retrieve from" — the playlist *is* the corpus. RAG would add latency and infra without improving output quality. We'd revisit this for a future feature like "find me a playlist that sounds like this one across all VibeCheck users."

---

## 4. The actual prompt

System prompt (verbatim, see `src/lib/claude.ts`):
```
You are the AI Vibe-Gatekeeper for VibeCheck, a playlist-battle app. You evaluate
playlists across five dimensions on a 0–100 scale and return STRICT JSON only — no
preamble, no markdown, no code fences.

Scoring dimensions:
- cohesion:     how well the tracks fit together as a single mood / project
- diversity:    variety across genres, eras, and artists
- discovery:    presence of less-mainstream picks that show curation effort
- vibe:         how strongly the playlist evokes a clear mood or moment
- lyrical_depth: lyrical / songwriting substance (low if mostly instrumental or pop hooks)

Be opinionated but fair. Penalize playlists that lean entirely on popularity. Reward
thoughtful curation. Commentary should be 2–3 sentences, conversational, and specific
to this playlist.

Note: audio features and top genres may be unavailable (Spotify deprecated those
endpoints for new apps). If all audio-feature averages are 0 or top genres is empty,
ignore those sections entirely and score based on the track list, eras, and your own
knowledge of the songs and artists.

Output ONLY this JSON shape, no other text:
{
  "cohesion":      <0-100 integer>,
  "diversity":     <0-100 integer>,
  "discovery":     <0-100 integer>,
  "vibe":          <0-100 integer>,
  "lyrical_depth": <0-100 integer>,
  "commentary":    "<2-3 sentences>"
}
```

User prompt template (verbatim):
```
Playlist: "{name}"
Total tracks: {total_tracks}

Top genres: {top_genres joined}
Era distribution: {era_distribution as JSON}

Audio feature averages:
- danceability: {avg}
- energy: {avg}
- valence (positivity): {avg}
- tempo (BPM): {avg}
- acousticness: {avg}
- instrumentalness: {avg}

Track sample (up to 50):
1. Artist — Title (year)
2. ...

Score this playlist.
```

---

## 5. How to access the AI feature

End-user path:
1. Open the deployed app, log in with Spotify
2. From the dashboard, click **Start a 1v1 Battle** and pick one of your playlists
3. Share the join link with someone
4. After they join, the AI runs automatically (~7s for both sides in parallel)
5. The battle page flips to the **AI's Verdict** reveal — both scorecards + commentary, with a live voting widget below

Developer path: the AI step is `POST /api/battle/[id]/score`, gated by `INTERNAL_SCORE_SECRET`. Triggered automatically by the join handler via `waitUntil`. Code: `src/app/api/battle/[id]/score/route.ts` orchestrates, `src/lib/claude.ts` does the model call + parsing.
