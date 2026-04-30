import Anthropic from "@anthropic-ai/sdk";
import type { PlaylistSummary, Scorecard } from "./types";

// Spec said claude-sonnet-4-5; using the current Sonnet (4.6) instead.
// See DECISIONS.md.
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the AI Vibe-Gatekeeper for VibeCheck, a playlist-battle app. You evaluate playlists across five dimensions on a 0–100 scale and return STRICT JSON only — no preamble, no markdown, no code fences.

Scoring dimensions:
- cohesion: how well the tracks fit together as a single mood / project (high = consistent vibe; low = scattered)
- diversity: variety across genres, eras, and artists (high = diverse without losing thread; low = same-y)
- discovery: presence of less-mainstream picks that show curation effort (high = thoughtful obscure picks; low = top-40 only)
- vibe: how strongly the playlist evokes a clear mood or moment
- lyrical_depth: lyrical / songwriting substance based on your knowledge of the songs (low if mostly instrumental or pop hooks)

Be opinionated but fair. Penalize playlists that lean entirely on popularity. Reward thoughtful curation. Commentary should be 2–3 sentences, conversational, and specific to this playlist.

Output ONLY this JSON shape, no other text:
{
  "cohesion": <0-100 integer>,
  "diversity": <0-100 integer>,
  "discovery": <0-100 integer>,
  "vibe": <0-100 integer>,
  "lyrical_depth": <0-100 integer>,
  "commentary": "<2-3 sentences>"
}`;

function buildUserPrompt(s: PlaylistSummary): string {
  const numbered = s.tracks
    .slice(0, 50)
    .map((t, i) => `${i + 1}. ${t.artist} — ${t.title}${t.year ? ` (${t.year})` : ""}`)
    .join("\n");
  const af = s.audio_features_avg;
  return `Playlist: "${s.name}"
Total tracks: ${s.total_tracks}

Top genres: ${s.top_genres.length ? s.top_genres.join(", ") : "(none detected)"}
Era distribution: ${JSON.stringify(s.era_distribution)}

Audio feature averages:
- danceability: ${af.danceability}
- energy: ${af.energy}
- valence (positivity): ${af.valence}
- tempo (BPM): ${af.tempo}
- acousticness: ${af.acousticness}
- instrumentalness: ${af.instrumentalness}

Track sample (up to 50):
${numbered}

Score this playlist.`;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const REQUIRED_KEYS: Array<keyof Scorecard> = [
  "cohesion",
  "diversity",
  "discovery",
  "vibe",
  "lyrical_depth",
  "commentary"
];

function parseScorecard(raw: string): Scorecard {
  const cleaned = raw.replace(/```json\n?|```/g, "").trim();
  // Find the first { and last } to be tolerant of stray text.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
  const parsed = JSON.parse(slice);
  for (const k of REQUIRED_KEYS) {
    if (!(k in parsed)) throw new Error(`Missing field: ${k}`);
  }
  for (const k of REQUIRED_KEYS) {
    if (k === "commentary") continue;
    const v = parsed[k];
    if (typeof v !== "number" || v < 0 || v > 100) {
      throw new Error(`Field ${k} not a 0-100 number: ${v}`);
    }
    parsed[k] = Math.round(v);
  }
  if (typeof parsed.commentary !== "string") throw new Error("commentary not a string");
  return parsed as Scorecard;
}

export async function scorePlaylist(summary: PlaylistSummary): Promise<{ scorecard: Scorecard; raw: string }> {
  const userPrompt = buildUserPrompt(summary);
  let lastErr: unknown = null;
  let lastRaw = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client().messages.create({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }]
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      lastRaw = text;
      const scorecard = parseScorecard(text);
      return { scorecard, raw: text };
    } catch (err) {
      lastErr = err;
      console.warn(`scorePlaylist attempt ${attempt + 1} failed`, err);
    }
  }
  console.error("scorePlaylist final failure raw:", lastRaw);
  throw new Error(`Claude scoring failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
