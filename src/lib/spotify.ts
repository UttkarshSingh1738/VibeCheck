import type {
  AudioFeaturesAvg,
  PlaylistSummary,
  PlaylistTrack,
  SpotifyPlaylist
} from "./types";

const API = "https://api.spotify.com/v1";

async function spotifyFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (res.status === 429) {
    console.warn("Spotify 429 rate limit on", path);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function getMe(token: string): Promise<{ id: string }> {
  return spotifyFetch(token, "/me");
}

type RawPlaylist = {
  id: string;
  name: string;
  images?: Array<{ url: string }> | null;
  // Spotify renamed `tracks` → `items` for new apps (post-2024) so playlists
  // can contain episodes/audiobooks. We accept either shape.
  items?: { total?: number | null } | null;
  tracks?: { total?: number | null } | null;
  owner: { id: string };
};

export async function listOwnPlaylists(token: string, ownerId: string): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{ items: RawPlaylist[] }>(token, "/me/playlists?limit=50");
  return data.items
    .filter((p) => p.owner?.id === ownerId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url ?? null,
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      ownerId: p.owner.id
    }));
}

export async function getPlaylistMeta(token: string, playlistId: string): Promise<{ name: string; total: number }> {
  // Request both possible field names. New apps return `items`; older apps return `tracks`.
  const data = await spotifyFetch<{
    name?: string | null;
    items?: { total?: number | null } | null;
    tracks?: { total?: number | null } | null;
  }>(token, `/playlists/${playlistId}?fields=name,items(total),tracks(total)`);
  return {
    name: data?.name ?? "Untitled playlist",
    total: data?.items?.total ?? data?.tracks?.total ?? 0
  };
}

type RawTrackPayload = {
  id: string;
  name: string;
  type?: string;
  album?: { release_date?: string | null } | null;
  artists?: Array<{ id: string; name: string }> | null;
};

type RawTrackItem = {
  // New shape: { item: {...}, track: true }  (track is a boolean flag)
  // Old shape: { track: {...} }              (track is the object)
  item?: RawTrackPayload | null;
  track?: RawTrackPayload | boolean | null;
};

function pickTrackPayload(it: RawTrackItem): RawTrackPayload | null {
  if (it.item && typeof it.item === "object") return it.item;
  if (it.track && typeof it.track === "object") return it.track as RawTrackPayload;
  return null;
}

export async function getPlaylistTracks(token: string, playlistId: string, limit = 50): Promise<PlaylistTrack[]> {
  // /tracks is 403 for new apps; /items is the replacement (and works for older apps too).
  let data: { items?: RawTrackItem[] | null } | null = null;
  try {
    data = await spotifyFetch<{ items?: RawTrackItem[] | null } | null>(
      token,
      `/playlists/${playlistId}/items?limit=${limit}`
    );
  } catch (err) {
    console.warn("/items failed, falling back to /tracks", err);
    data = await spotifyFetch<{ items?: RawTrackItem[] | null } | null>(
      token,
      `/playlists/${playlistId}/tracks?limit=${limit}`
    );
  }
  const items = data?.items ?? [];
  const out: PlaylistTrack[] = [];
  for (const it of items) {
    const t = pickTrackPayload(it);
    if (!t || !t.id) continue;
    if (t.type && t.type !== "track") continue; // skip episodes / audiobooks
    const year = t.album?.release_date
      ? Number.parseInt(t.album.release_date.slice(0, 4), 10)
      : null;
    out.push({
      id: t.id,
      title: t.name ?? "(untitled)",
      artist: (t.artists ?? []).map((a) => a.name).join(", "),
      artistId: t.artists?.[0]?.id ?? null,
      year: Number.isFinite(year as number) ? (year as number) : null
    });
  }
  return out;
}

type RawAudioFeatures = {
  danceability: number;
  energy: number;
  valence: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
} | null;

const ZERO_AUDIO: AudioFeaturesAvg = {
  danceability: 0,
  energy: 0,
  valence: 0,
  tempo: 0,
  acousticness: 0,
  instrumentalness: 0
};

// Spotify deprecated /audio-features for apps created after 2024-11-27. New
// apps get a 403. We fall back to zeros so scoring still works — Claude is
// instructed to ignore the audio block when everything is zero.
export async function getAudioFeaturesAvg(token: string, trackIds: string[]): Promise<AudioFeaturesAvg> {
  if (trackIds.length === 0) return { ...ZERO_AUDIO };
  try {
    const data = await spotifyFetch<{ audio_features: RawAudioFeatures[] }>(
      token,
      `/audio-features?ids=${trackIds.join(",")}`
    );
    const vals = data.audio_features.filter((x): x is NonNullable<RawAudioFeatures> => !!x);
    if (vals.length === 0) return { ...ZERO_AUDIO };
    const n = vals.length;
    const sum = (k: keyof NonNullable<RawAudioFeatures>) =>
      vals.reduce((acc, v) => acc + (v[k] ?? 0), 0) / n;
    return {
      danceability: round2(sum("danceability")),
      energy: round2(sum("energy")),
      valence: round2(sum("valence")),
      tempo: Math.round(sum("tempo")),
      acousticness: round2(sum("acousticness")),
      instrumentalness: round2(sum("instrumentalness"))
    };
  } catch (err) {
    console.warn("audio-features unavailable (likely deprecated for new app), continuing with zeros", err);
    return { ...ZERO_AUDIO };
  }
}

export async function getTopGenres(token: string, artistIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(artistIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return [];
  try {
    const data = await spotifyFetch<{ artists: Array<{ genres: string[] }> }>(
      token,
      `/artists?ids=${unique.join(",")}`
    );
    const counts = new Map<string, number>();
    for (const a of data.artists) {
      for (const g of a.genres ?? []) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);
  } catch (err) {
    console.warn("artist genres unavailable, continuing without", err);
    return [];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bucketYear(year: number | null): string | null {
  if (!year) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

export async function buildPlaylistSummary(token: string, playlistId: string): Promise<PlaylistSummary> {
  const meta = await getPlaylistMeta(token, playlistId);
  const tracks = await getPlaylistTracks(token, playlistId, 50);
  if (tracks.length === 0) {
    throw new Error(
      `Playlist ${playlistId} returned 0 tracks. It may be empty, private, or an algorithmic playlist (e.g. Liked Songs / Discover Weekly) that Spotify's client-credentials token can't read.`
    );
  }
  const trackIds = tracks.map((t) => t.id);
  const artistIds = tracks.map((t) => t.artistId).filter((x): x is string => !!x);

  const [audio, genres] = await Promise.all([
    getAudioFeaturesAvg(token, trackIds),
    getTopGenres(token, artistIds)
  ]);

  const eraDist: Record<string, number> = {};
  for (const t of tracks) {
    const b = bucketYear(t.year);
    if (b) eraDist[b] = (eraDist[b] ?? 0) + 1;
  }

  return {
    name: meta.name,
    total_tracks: meta.total,
    tracks: tracks.map((t) => ({ title: t.title, artist: t.artist, year: t.year })),
    audio_features_avg: audio,
    top_genres: genres,
    era_distribution: eraDist
  };
}
