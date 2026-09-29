"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Disc3, Heart, ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { demoHost } from "@/lib/resonance/demo-host";
import { formatTime } from "@/lib/resonance/library";
import type { AudioTrack } from "@/lib/resonance/types";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";
import { useHost } from "./HostProvider";
import { AlbumTile } from "./AlbumTile";

export function CurrentPlaybackBar({ player }: { player: ResonancePlayer }) {
  const host = useHost();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const track = audioTracks.find(item => item.id === host.trackId);
  const isCurrent = !!track && player.track?.id === track.id;
  const playing = isCurrent && player.wantsPlayback;
  const favorite = !!track && host.data.favoriteIds.includes(track.id);
  const duration = isCurrent && player.duration ? player.duration : track?.duration ?? 0;
  const position = isCurrent ? player.currentTime : 0;
  const { track: loadedTrack, wantsPlayback, stop, playTrack, prepareTrack } = player;

  // The debug host picker and the public playback controls share the same source.
  useEffect(() => {
    if (!track) { if (loadedTrack) stop(); return; }
    if (loadedTrack && (loadedTrack.id !== track.id || loadedTrack.revision !== track.revision)) {
      if (wantsPlayback) void playTrack(track);
      else prepareTrack(track);
    }
  }, [track, loadedTrack, wantsPlayback, stop, playTrack, prepareTrack]);

  function select(next: AudioTrack, shouldPlay: boolean) {
    demoHost.setTrack(next.id);
    if (shouldPlay) void player.playTrack(next);
    else player.prepareTrack(next);
  }
  function step(direction: number) {
    if (!audioTracks.length) return;
    const index = audioTracks.findIndex(item => item.id === track?.id);
    select(audioTracks[index < 0 ? 0 : (index + direction + audioTracks.length) % audioTracks.length], playing);
  }
  async function toggleFavorite() {
    if (!track || saving) return;
    setSaving(true);
    try { await host.save(favorite ? "unfavorite" : "favorite", track.id); } finally { setSaving(false); }
  }
  const status = playing ? player.status === "loading" ? "正在加载" : "正在播放" : isCurrent ? player.status === "ended" ? "播放结束" : "已暂停" : "当前播放";
  return <footer className="tp-player" aria-label="当前播放" data-audio-status={player.status} data-play-intent={player.wantsPlayback}>
    <div className="tp-player-top">
      {track ? <AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="sm" /> : <span className="tp-player-empty"><Disc3 size={24} aria-hidden="true" /></span>}
      <div className="tp-player-meta"><strong>{track?.track ?? "选择一首歌"}</strong><small><span className="tp-sr">{status}：</span>{track?.artist ?? (audioTracks.length ? "打开歌单，选首喜欢的" : "歌单暂无歌曲")}</small></div>
      <button type="button" className="tp-icon-btn tp-fav" aria-label={favorite ? "取消收藏当前歌曲" : "收藏当前歌曲"} aria-pressed={favorite} disabled={!track || saving || host.dataLoading || !!host.dataError} onClick={() => void toggleFavorite()}><Heart size={20} fill={favorite ? "currentColor" : "none"} aria-hidden="true" /></button>
      <button type="button" className="tp-icon-btn" aria-label={open ? "收起播放列表" : "打开播放列表"} aria-expanded={open} aria-controls="current-playlist" onClick={() => setOpen(value => !value)}><ListMusic size={20} aria-hidden="true" /></button>
    </div>
    <div className="tp-player-bottom">
      <button type="button" className="tp-icon-btn" aria-label="上一首" disabled={audioTracks.length < 2} onClick={() => step(-1)}><SkipBack size={20} aria-hidden="true" /></button>
      <button type="button" className="tp-play" aria-label={playing ? "暂停当前歌曲" : "播放当前歌曲"} disabled={!track} onClick={() => { if (playing) player.pause(); else if (track) void player.playTrack(track); }}>{playing ? <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" /> : <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />}</button>
      <button type="button" className="tp-icon-btn" aria-label="下一首" disabled={audioTracks.length < 2} onClick={() => step(1)}><SkipForward size={20} aria-hidden="true" /></button>
      <div className="tp-progress"><span>{formatTime(position)}</span><input type="range" aria-label="当前歌曲进度" min={0} max={duration || 1} step={.1} value={Math.min(position, duration)} style={{ "--p": `${duration ? Math.min(100, position / duration * 100) : 0}%` } as CSSProperties} disabled={!isCurrent || !player.duration || player.status === "error"} onChange={event => player.seek(Number(event.target.value))} /><span className="tp-progress-total">{formatTime(duration)}</span></div>
    </div>
    {player.error && <p className="tp-player-error" role="alert">{player.error}</p>}
    <div id="current-playlist" hidden={!open} className="tp-playlist"><div className="tp-playlist-heading"><strong>播放列表</strong><span>{audioTracks.length} 首</span></div>{audioTracks.length ? <ul>{audioTracks.map(item => <li key={item.id}><button type="button" aria-label={`播放 ${item.track}`} aria-pressed={item.id === track?.id} onClick={() => { select(item, true); setOpen(false); }}><AlbumTile coverUrl={item.coverUrl} accent={item.accent} size="sm" /><span><strong>{item.track}</strong><small>{item.artist}</small></span><span>{formatTime(item.duration)}</span></button></li>)}</ul> : <p>暂时没有歌曲</p>}</div>
  </footer>;
}
