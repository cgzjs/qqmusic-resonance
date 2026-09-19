export type SceneId = "metro" | "campus" | "cafe";

export type AppView = "radar" | "match" | "listening" | "exchange" | "journey";

export type SongSuggestion = {
  id: string;
  track: string;
  artist: string;
  reason: string;
  accent: string;
};

export type NearbyListener = {
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
};
