import type { AudioTrack } from "./types";

export const placeCopyStyles = ["gentle", "poetic", "brief"] as const;
export type PlaceCopyStyle = (typeof placeCopyStyles)[number];

export type PlaceCopySuggestion = {
  title: string;
  message: string;
};

type PlaceCopyInput = {
  track: Pick<AudioTrack, "track" | "artist">;
  style: PlaceCopyStyle;
};

const styleLabels: Record<PlaceCopyStyle, string> = {
  gentle: "温柔",
  poetic: "文艺",
  brief: "简短",
};

const templates: Record<PlaceCopyStyle, Array<{ title: string; message: (track: PlaceCopyInput["track"]) => string }>> = {
  gentle: [
    { title: "留给路过的你", message: track => `如果你也刚好路过这里，愿《${track.track}》陪你走一段。` },
    { title: "给下一位听见的人", message: track => `把刚听完的《${track.track}》留给下一位，希望你会喜欢。` },
    { title: "把这首歌留在这里", message: track => `在这里听见${track.artist}，也把这份心情留给路过的你。` },
  ],
  poetic: [
    { title: "风经过的时候", message: track => `风从这里经过，我把《${track.track}》放在原地，等下一位听见。` },
    { title: "在这里，听见一首歌", message: track => `这一刻没有解释，只有《${track.track}》和路过的你。` },
    { title: "给这片刻留一束声音", message: track => `如果你也想听点${track.artist}，就从这首开始吧。` },
  ],
  brief: [
    { title: "路过时听听", message: track => `路过这里时，听听《${track.track}》。愿这首歌刚好接住你。` },
    { title: "给你一首歌", message: track => `《${track.track}》，留给下一位经过这里的人。` },
    { title: "这一刻的歌", message: track => `这一刻在听${track.artist}，也分享给你。` },
  ],
};

export function generatePlaceCopySuggestions({ track, style }: PlaceCopyInput): PlaceCopySuggestion[] {
  const trackName = track.track.trim();
  const artist = track.artist.trim();
  if (!trackName || !artist) return [];
  return templates[style].map(item => ({ title: item.title, message: item.message({ track: trackName, artist }) }));
}

export function placeCopyStyleLabel(style: PlaceCopyStyle) {
  return styleLabels[style];
}
