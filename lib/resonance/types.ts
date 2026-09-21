export type SceneId = "metro" | "campus" | "cafe";

export type AppView = "radar" | "match" | "listening" | "exchange" | "journey";

export type SongSuggestion = {
  coverUrl?: string;
  id: string;
  track: string;
  artist: string;
  reason: string;
  accent: string;
};

export type NearbyListener = {
  coverUrl?: string;
  id: string;
  track: string;
  artist: string;
  similarity: number;
  distanceLabel: string;
  genres: string[];
  sharedArtists: string[];
  suggestions: SongSuggestion[];
  position: { x: number; y: number };
  accent: string;
  audioTrackId?: string;
};

export type AudioTrack = {
  coverUrl?: string;
  duration: number;
  mimeType: string;
  byteLength: number;
  revision: string;
  available: boolean;
  id: string;
  track: string;
  artist: string;
  accent: string;
  audioUrl: string;
  source: string;
};

export type JourneyEvent = {
  id: string;
  type: "discover" | "listen" | "exchange";
  trackId: string;
  listenerId: string;
  scene: SceneId;
  createdAt: string;
  receivedTrackId?: string;
};

export type MusicLibrary = {
  version: 1;
  favoriteIds: string[];
  listenLaterIds: string[];
  events: JourneyEvent[];
};

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";
export type ExchangeStatus = "choosing" | "sending" | "received";
