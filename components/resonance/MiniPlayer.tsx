import { Pause, Play, X } from "lucide-react";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";

export function MiniPlayer({ player, onOpen }: { player: ResonancePlayer; onOpen: () => void }) {
  if (!player.track) return null;
  const isPlaying = player.status === "playing" || player.status === "loading";
  return (
    <div className="mini-player" aria-label="迷你播放器">
      <button type="button" className="mini-player__track" onClick={onOpen}><strong>{player.track.track}</strong><span>{player.error ? "播放失败 · 点击查看" : player.status === "loading" ? "正在加载" : player.status === "ended" ? "试听结束" : isPlaying ? "正在试听" : "已暂停"}</span></button>
      <button type="button" aria-label={isPlaying ? "暂停试听" : "继续试听"} onClick={player.toggle}>{isPlaying ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}</button>
      <button type="button" aria-label="关闭播放器" onClick={player.stop}><X size={17} aria-hidden="true" /></button>
    </div>
  );
}
