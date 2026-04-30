export type Side = "host" | "opponent";

export type BattleStatus = "waiting" | "scoring" | "voting" | "done" | "failed";

export type DBUser = {
  id: string;
  spotify_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type DBBattle = {
  id: string;
  host_user_id: string;
  opponent_user_id: string | null;
  host_playlist_id: string;
  opponent_playlist_id: string | null;
  status: BattleStatus;
  vote_closes_at: string | null;
  winner: Side | null;
  created_at: string;
};

export type Scorecard = {
  cohesion: number;
  diversity: number;
  discovery: number;
  vibe: number;
  lyrical_depth: number;
  commentary: string;
};

export type DBScorecard = Scorecard & {
  id: string;
  battle_id: string;
  side: Side;
  raw_response: unknown;
  created_at: string;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  image: string | null;
  trackCount: number;
  ownerId: string;
};

export type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  year: number | null;
};

export type AudioFeaturesAvg = {
  danceability: number;
  energy: number;
  valence: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
};

export type PlaylistSummary = {
  name: string;
  total_tracks: number;
  tracks: Array<{ title: string; artist: string; year: number | null }>;
  audio_features_avg: AudioFeaturesAvg;
  top_genres: string[];
  era_distribution: Record<string, number>;
};

export type BattleDetail = {
  battle: DBBattle;
  host: { user: DBUser | null; playlistName: string | null };
  opponent: { user: DBUser | null; playlistName: string | null };
  scorecards: { host: DBScorecard | null; opponent: DBScorecard | null };
  tally: { host: number; opponent: number };
};
