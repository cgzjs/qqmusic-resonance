import type { JourneyEvent, MusicLibrary } from "./types";

export const LIBRARY_KEY = "resonance.library.v1";
export const emptyLibrary: MusicLibrary = { version: 1, favoriteIds: [], listenLaterIds: [], events: [] };
const scenes = new Set(["metro", "campus", "cafe"]);

export type LibraryAction =
  | { type: "event"; event: JourneyEvent }
  | { type: "favorite"; trackId: string }
  | { type: "later"; trackId: string }
  | { type: "removeFavorite" | "removeLater"; trackId: string };

export function updateLibrary(state: MusicLibrary, action: LibraryAction): MusicLibrary {
  switch (action.type) {
    case "event":
      if (state.events.some(event => event.id === action.event.id)) return state;
      return { ...state, events: [...state.events, action.event].slice(-300) };
    case "favorite":
      return { ...state, favoriteIds: [...new Set([...state.favoriteIds, action.trackId])], listenLaterIds: state.listenLaterIds.filter(id => id !== action.trackId) };
    case "later":
      if (state.favoriteIds.includes(action.trackId)) return state;
      return { ...state, listenLaterIds: [...new Set([...state.listenLaterIds, action.trackId])] };
    case "removeFavorite": return { ...state, favoriteIds: state.favoriteIds.filter(id => id !== action.trackId) };
    case "removeLater": return { ...state, listenLaterIds: state.listenLaterIds.filter(id => id !== action.trackId) };
  }
}

export function parseLibrary(raw: string | null, trackIds: Set<string>, listenerIds: Set<string>): MusicLibrary {
  try {
    if (!raw) return emptyLibrary;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return emptyLibrary;
    const ids = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && trackIds.has(id)))] : [];
    const favoriteIds = ids(parsed.favoriteIds);
    const seen = new Set<string>();
    const events: JourneyEvent[] = Array.isArray(parsed.events) ? parsed.events.filter((event: JourneyEvent) => {
      if (!event || typeof event !== "object" || typeof event.id !== "string" || !event.id || seen.has(event.id)) return false;
      if (!["discover", "listen", "exchange"].includes(event.type) || !trackIds.has(event.trackId) || !listenerIds.has(event.listenerId) || !scenes.has(event.scene)) return false;
      if (typeof event.createdAt !== "string" || !Number.isFinite(Date.parse(event.createdAt))) return false;
      if (event.type === "exchange" && (!event.receivedTrackId || !trackIds.has(event.receivedTrackId) || event.receivedTrackId === event.trackId)) return false;
      seen.add(event.id); return true;
    }).map((event: JourneyEvent) => ({ id: event.id, type: event.type, trackId: event.trackId, listenerId: event.listenerId, scene: event.scene, createdAt: event.createdAt, ...(event.type === "exchange" ? { receivedTrackId: event.receivedTrackId } : {}) })).slice(-300) : [];
    return { version: 1, favoriteIds, listenLaterIds: ids(parsed.listenLaterIds).filter(id => !favoriteIds.includes(id)), events };
  } catch { return emptyLibrary; }
}

export function pickReceivedTrack(outgoingId: string, availableIds: string[], exchangeIndex: number): string | null {
  const candidates = [...new Set(availableIds)].filter(id => id !== outgoingId);
  return candidates.length ? candidates[Math.max(0, exchangeIndex) % candidates.length] : null;
}

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}
