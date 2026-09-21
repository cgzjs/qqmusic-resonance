"use client";

import { Heart, Pause, Play, Send, Volume2, RotateCcw } from "lucide-react";
import { ReactionDock } from "./ReactionDock";
import { audioTracks } from "@/lib/resonance/demo-data";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import { ViewHeader } from "@/components/resonance/ViewHeader";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/resonance/library";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";

type ListeningSessionProps = {
  onOpenOnline: () => void;
  player: ResonancePlayer;
  reaction: "wave" | "heart" | null;
  isFavorite: boolean;
  onReact: (reaction: "wave" | "heart") => void;
  onToggleFavorite: () => void;
  onBack: () => void;
  onExchange: () => void;
  onEnd: () => void;
};

export function ListeningSession({ player, isFavorite, onReact, onToggleFavorite, onBack, onExchange, onEnd, onOpenOnline }: ListeningSessionProps) {
  const { track, status } = player;
  if (!track) return null;
  const isPlaying = status === "playing" || status === "loading";
  const statusLabel = { idle: "准备试听", loading: "正在加载音频", playing: "正在试听", paused: "已暂停", ended: "试听结束", error: "播放遇到问题" }[status];
  return (
    <section className="screen-view listening-view" data-playing={status === "playing"}>
      <ViewHeader eyebrow="单人跟听演示" title={statusLabel} onBack={onBack} />
      <div className="listening-art">
        <AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="lg" />
      </div>
      <div className="now-playing"><p>NOW PLAYING</p><h3>{track.track}</h3><span>{track.artist}</span></div>
      <p className="audio-source">{track.source}</p>
      <div className="player-progress">
        <input className="audio-range" type="range" aria-label="播放进度" aria-valuetext={`${formatTime(player.currentTime)} / ${formatTime(player.duration)}`} min={0} max={player.duration || 1} step={.1} value={Math.min(player.currentTime, player.duration || 0)} disabled={!player.duration || status === "error"} onChange={event => player.seek(Number(event.target.value))} />
        <div><span>{formatTime(player.currentTime)}</span><span>{formatTime(player.duration)}</span></div>
      </div>
      {player.error && <div className="playback-error" role="alert"><span>{player.error}</span><button type="button" onClick={() => void player.playTrack(track)}>重试</button></div>}
      <div className="player-controls">
        <Button variant="outline" className="round-control" aria-label={isPlaying ? "暂停" : status === "ended" ? "重新播放" : "播放"} onClick={player.toggle}>
          {isPlaying ? <Pause aria-hidden="true" /> : status === "ended" ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <Button variant="outline" className="round-control" aria-label={isFavorite ? "取消收藏" : "收藏歌曲"} aria-pressed={isFavorite} onClick={onToggleFavorite}><Heart aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} /></Button>
        <Button className="exchange-cta" disabled={audioTracks.length < 2} onClick={onExchange}><Send aria-hidden="true" />交换一首</Button>
      </div>
      <label className="audio-volume"><Volume2 size={16} aria-hidden="true" /><span>音量</span><input className="audio-range" type="range" aria-label="音量" min={0} max={1} step={.05} value={player.volume} onChange={event => player.changeVolume(Number(event.target.value))} /></label>
      <ReactionDock mode="demo" onSend={onReact} />
      <Button variant="ghost" className="end-listening" onClick={onEnd}>结束试听</Button>
      <button type="button" className="invite-listening-link" onClick={onOpenOnline}>查看在线听众，邀请同频 →</button>
    </section>
  );
}
