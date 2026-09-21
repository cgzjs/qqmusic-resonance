import generated from "./catalog.generated.json" with { type: "json" };
import type { AudioTrack } from "./types";

export const audioTracks: AudioTrack[] = generated.tracks;
export const retiredTracks: AudioTrack[] = generated.retired;
export const catalogVersion = generated.catalogVersion;
export const allTracks = [...audioTracks, ...retiredTracks];
export const findCatalogTrack = (id: string | undefined): AudioTrack | undefined => allTracks.find(track => track.id === id);
