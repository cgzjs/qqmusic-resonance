import catalog from "./catalog.generated.json" with { type: "json" };
import type { AudioTrack, NearbyListener, SceneId } from "./types";

// Fixed illustrative waveform, not decoded audio or live playback measurements.
export const coverWaveformPeaks = [
  12, 18, 10, 25, 34, 29, 48, 63, 42, 70, 52, 39, 56, 31, 22, 36,
  17, 26, 13, 19, 33, 47, 41, 59, 78, 66, 89, 62, 74, 50, 39, 56,
  32, 23, 38, 16, 11, 19, 29, 23, 44, 58, 37, 69, 83, 62, 49, 72,
  54, 41, 30, 45, 25, 18, 28, 13, 22, 36, 51, 39, 63, 47, 33, 55,
  41, 28, 34, 21, 30, 17, 12, 8,
];

export const sceneLabels: Record<SceneId, string> = {
  metro: "地铁 2 号线",
  campus: "五角场校区",
  cafe: "街角咖啡店",
};

export const sceneDistanceLabels: Record<SceneId, string> = {
  metro: "车站附近",
  campus: "校园附近",
  cafe: "街区附近",
};

export const audioTracks: AudioTrack[] = catalog.tracks;

export const nearbyListeners: NearbyListener[] = [
  {
    id: "listener-01",
    track: "LONG SEASON",
    artist: "Fishmans",
    similarity: 87,
    distanceLabel: "同一节车厢",
    genres: ["Dream Pop", "Indie", "J-Pop"],
    sharedArtists: ["Lamp", "宇多田光", "Cornelius"],
    suggestions: [
      { id: "song-01", track: "Aruarian Dance", artist: "Nujabes", reason: "柔软的夜行节奏", accent: "#e6b86b" },
      { id: "song-02", track: "春らんまん", artist: "Never Young Beach", reason: "你们都收藏了 Lamp", accent: "#81d9bd" },
      { id: "song-03", track: "新しい人", artist: "Fishmans", reason: "延续此刻的松弛感", accent: "#a9c7ff" },
    ],
    position: { x: 66, y: 30 },
    accent: "#b9ff66",
  },
  {
    id: "listener-02",
    track: "Space Song",
    artist: "Beach House",
    similarity: 78,
    distanceLabel: "附近区域",
    genres: ["Dream Pop", "Ambient"],
    sharedArtists: ["Slowdive", "Men I Trust"],
    suggestions: [
      { id: "song-04", track: "Myth", artist: "Beach House", reason: "同一片朦胧声场", accent: "#c2b1ff" },
      { id: "song-05", track: "Sugar for the Pill", artist: "Slowdive", reason: "来自共同收藏", accent: "#8fc8dc" },
      { id: "song-06", track: "Show Me How", artist: "Men I Trust", reason: "适合晚高峰窗外", accent: "#d0d797" },
    ],
    position: { x: 23, y: 47 },
    accent: "#8cc8ff",
  },
  {
    id: "listener-03",
    track: "After Hours",
    artist: "The Weeknd",
    similarity: 69,
    distanceLabel: "刚刚擦肩",
    genres: ["R&B", "Synthpop"],
    sharedArtists: ["Frank Ocean", "Joji"],
    suggestions: [
      { id: "song-07", track: "Pink + White", artist: "Frank Ocean", reason: "你们都爱慢拍 R&B", accent: "#ffb0a6" },
      { id: "song-08", track: "Glimpse of Us", artist: "Joji", reason: "来自共同收藏", accent: "#beb9ff" },
      { id: "song-09", track: "Nights", artist: "Frank Ocean", reason: "午夜通勤的下一首", accent: "#8aa9f5" },
    ],
    position: { x: 71, y: 72 },
    accent: "#ff8e72",
  },
  {
    id: "listener-04",
    track: "恋人へ",
    artist: "Lamp",
    similarity: 92,
    distanceLabel: "同一节车厢",
    genres: ["City Pop", "J-Pop"],
    sharedArtists: ["Fishmans", "大貫妙子"],
    suggestions: [
      { id: "song-10", track: "都会", artist: "大貫妙子", reason: "你们都喜欢城市夜色", accent: "#efc178" },
      { id: "song-11", track: "Sea Gets Hotter", artist: "Durand Jones", reason: "从 City Pop 向外一步", accent: "#73c6a6" },
      { id: "song-12", track: "For Lovers", artist: "Lamp", reason: "留给擦肩之后", accent: "#d9bde5" },
    ],
    position: { x: 36, y: 78 },
    accent: "#e9d4ff",
  },
];

// Experience audio metadata matches the locally generated recordings.
// The cover's original concept examples above remain visual-only.
const builtInListeners: Record<string, string> = { "demo-night": "listener-01", "demo-glass": "listener-02", "demo-breeze": "listener-03", "demo-dawn": "listener-04" };
export const playableListeners: NearbyListener[] = audioTracks.map((track, index) => {
  const template = nearbyListeners[index % nearbyListeners.length];
  return {
    ...template, id: builtInListeners[track.id] ?? `listener-${track.id}`,
    track: track.track, artist: track.artist, accent: track.accent, coverUrl: track.coverUrl,
    audioTrackId: track.id, sharedArtists: [track.artist],
    suggestions: audioTracks.filter(item => item.id !== track.id).map(item => ({
      id: item.id, track: item.track, artist: item.artist, accent: item.accent, coverUrl: item.coverUrl,
      reason: "来自当前模拟歌单",
    })),
  };
});
const sceneIds = (parity: number) => {
  const ids = playableListeners.filter((_, index) => index % 2 === parity).map(listener => listener.id);
  return ids.length ? ids : playableListeners.slice(0, 1).map(listener => listener.id);
};
export const sceneListenerIds: Record<SceneId, string[]> = {
  metro: playableListeners.map(listener => listener.id), campus: sceneIds(1), cafe: sceneIds(0),
};
