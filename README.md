# VibeCheck

Whose music taste is actually better? Two friends pick Spotify playlists, Claude scores them, voters pick a winner, and a hybrid score crowns the champion.

This is a class-project MVP built from `VibeCheck_Build_Spec.md`. See [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) for an end-user walkthrough and [DECISIONS.md](./DECISIONS.md) for the shortcuts that were taken.

---

## Quickstart (under 15 min)

### 1. Install
```bash
pnpm install     # or: npm install
```

### 2. Create the three external services

**Spotify** — https://developer.spotify.com/dashboard
- Create an app named "VibeCheck (dev)"
- Add redirect URI: `http://127.0.0.1:3000/api/auth/callback/spotify`  
  *(Spotify rejects `localhost` for new apps—use the IPv4 loopback literal. It must match `NEXTAUTH_URL` exactly.)*
- Copy `Client ID` and `Client Secret`

**Supabase** — https://supabase.com
- Create a new project
- Open the **SQL Editor**, paste in `supabase/schema.sql`, run it
- Project Settings → API: copy `URL`, `anon public` key, and `service_role` key

**Anthropic** — https://console.anthropic.com
- Generate an API key

### 3. Env file
```bash
cp .env.example .env.local
# fill in every value. NEXTAUTH_SECRET: openssl rand -base64 32
# INTERNAL_SCORE_SECRET: openssl rand -hex 24
```

### 4. Run
```bash
pnpm dev     # or: npm run dev — binds to 127.0.0.1 (see package.json)
```
Open **http://127.0.0.1:3000** (must match `NEXTAUTH_URL` and Spotify redirect URI). If you use `http://localhost:3000` instead, the app will one-shot redirect to loopback via `DevHostRedirect`; prefer opening 127.0.0.1 directly to avoid host ping-pong during OAuth.

---

## Try the full loop

1. Log in with Spotify on Browser A → land on `/dashboard` → click **Start a 1v1 Battle** → pick a playlist.
2. Copy the **share link** shown on the battle page.
3. Open that link in Browser B (different account; incognito works) → log in with Spotify → pick a playlist.
4. The page flips to **Scoring** while the server fetches both playlists, summarizes them, and sends each to Claude. About 10–30 seconds.
5. When status is **Voting**, copy the vote link and open it in any browser (no account needed) → cast a vote.
6. Click **Release results now** to skip the 24-hour timer → land on the results page.

---

## Project layout

```
src/
├── app/
│   ├── api/                   # all server routes (auth, battles, scoring, votes)
│   ├── battle/[id]/           # host's view + opponent join page
│   ├── vote/[id]/             # public voting page
│   ├── results/[id]/          # public results page
│   └── page.tsx               # landing
├── components/                # PlaylistGrid, ScorecardDisplay, ui/
├── lib/
│   ├── auth.ts                # NextAuth v5 + Spotify OAuth
│   ├── claude.ts              # prompt + JSON parsing
│   ├── score.ts               # hybrid score calc
│   ├── spotify.ts             # Web API wrappers
│   ├── supabase.ts            # service-role client + analytics
│   └── types.ts
└── middleware.ts              # gates protected routes
supabase/schema.sql            # paste into Supabase SQL editor
```

## Useful commands

```bash
pnpm dev         # start the app on :3000
pnpm typecheck   # tsc --noEmit
pnpm build       # production build
```

## Troubleshooting

- **Production deploy: browser opens `127.0.0.1` after Spotify login** — The deployed server still has dev `NEXTAUTH_URL` (loopback). Set `NEXTAUTH_URL` and `AUTH_URL` to your real public HTTPS origin (hosting dashboard / env vars), e.g. `https://yourdomain.com`, then add that callback in Spotify: `https://yourdomain.com/api/auth/callback/spotify`. Redeploy. Spotify follows whatever `redirect_uri` your app sends (from env), not the dashboard alone.
- **Spotify redirect URI / “INVALID_CLIENT: Invalid redirect URI”** — Dashboard redirect URI, `NEXTAUTH_URL`, and the URL you open in the browser must all use the same host. For local dev use `http://127.0.0.1:3000` everywhere, not `localhost` (Spotify blocks `localhost` for new apps).
- **"playlists fetch failed 401"** — your Spotify session expired. Sign out and back in.
- **Battle stuck on `scoring`** — check the server console. Most common cause: an opponent picked a *private* playlist that the client-credentials Spotify token can't read. Make playlists public, or see DECISIONS.md for the documented limitation.
- **Claude returns garbage JSON** — tighten the system prompt in `src/lib/claude.ts`. Raw responses are stored in `scorecards.raw_response` for debugging.
- **Supabase auth weird** — never expose the `service_role` key to the browser. Anything imported from `@/lib/supabase` is server-only.

See `HOW_IT_WORKS.md` for the full architecture walkthrough.
