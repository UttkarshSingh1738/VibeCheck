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
  images: Array<{ url: string }>;
  tracks: { total: number };
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
      trackCount: p.tracks?.total ?? 0,
      ownerId: p.owner.id
    }));
}

export async function getPlaylistMeta(token: string, playlistId: string): Promise<{ name: string; total: number }> {
  const data = await spotifyFetch<{ name: string; tracks: { total: number } }>(
    token,
    `/playlists/${playlistId}?fields=name,tracks(total)`
  );
  return { name: data.name, total: data.tracks.total };
}

type RawTrackItem = {
  track: {
    id: string;
    name: string;
    album: { release_date: string | null };
    artists: Array<{ id: string; name: string }>;
  } | null;
};

export async function getPlaylistTracks(token: string, playlistId: string, limit = 50): Promise<PlaylistTrack[]> {
  const data = await spotifyFetch<{ items: RawTrackItem[] }>(
    token,
    `/playlists/${playlistId}/tracks?limit=${limit}`
  );
  const out: PlaylistTrack[] = [];
  for (const it of data.items) {
    if (!it.track || !it.track.id) continue;
    const year = it.track.album?.release_date
      ? Number.parseInt(it.track.album.release_date.slice(0, 4), 10)
      : null;
    out.push({
      id: it.track.id,
      title: it.track.name,
      artist: it.track.artists.map((a) => a.name).join(", "),
      artistId: it.track.artists[0]?.id ?? null,
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

export async function getAudioFeaturesAvg(token: string, trackIds: string[]): Promise<AudioFeaturesAvg> {
  if (trackIds.length === 0) {
    return { danceability: 0, energy: 0, valence: 0, tempo: 0, acousticness: 0, instrumentalness: 0 };
  }
  const data = await spotifyFetch<{ audio_features: RawAudioFeatures[] }>(
    token,
    `/audio-features?ids=${trackIds.join(",")}`
  );
  const vals = data.audio_features.filter((x): x is NonNullable<RawAudioFeatures> => !!x);
  const n = vals.length || 1;
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
}

export async function getTopGenres(token: string, artistIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(artistIds.filter(Boolean))).slice(0, 50);
  if (unique.length === 0) return [];
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
