"use client";
import { useSyncExternalStore, type CSSProperties } from "react";
import { Headphones, Pause, Play } from "lucide-react";
import type { AudioTrack, NearbyListener } from "@/lib/resonance/types";
import { AlbumTile } from "./AlbumTile";

type Props = { active: boolean; playing?: boolean; loading?: boolean; motion?: boolean; onTogglePlayback?: () => void; track?: AudioTrack; listeners: NearbyListener[]; selectedId: string; onSelect: (listener: NearbyListener) => void };
const subscribeVisibility = (notify: () => void) => { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); };
const readVisible = () => document.visibilityState !== "hidden";
const serverVisible = () => true;

/** The record is the current song; listeners sit on the r=40 orbit (positions are percentages of the radar). */
export function OrbitRadar({ active, playing = false, loading = false, motion = true, onTogglePlayback, track, listeners, selectedId, onSelect }: Props) {
  const visible = useSyncExternalStore(subscribeVisibility, readVisible, serverVisible);
  const selected = listeners.find(listener => listener.id === selectedId);
  const route = selected ? `M 50 50 Q ${50 + (selected.position.x - 50) / 2 + 6} ${50 + (selected.position.y - 50) / 2 - 6} ${selected.position.x} ${selected.position.y}` : "";
  return <section className="orbit-map tp-radar" aria-label="附近音乐雷达" data-active={active} data-playing={playing} data-motion={motion && visible} data-crowded={listeners.length > 1}>
    <svg className="tp-rings" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49.4" /><circle className="tp-rings-orbit" cx="50" cy="50" r="40" /><circle cx="50" cy="50" r="31" />
      {selected && <><path className="tp-route" d={route} />{active && motion && visible && <circle className="tp-signal" r="1"><animateMotion dur="3.8s" repeatCount="indefinite" path={route} /></circle>}</>}
    </svg>
    <span className="tp-sweep" aria-hidden="true" />
    <button type="button" className="orbit-self tp-disc" disabled={!track || !onTogglePlayback} onClick={onTogglePlayback} aria-label={`${playing || loading ? "暂停" : "播放"}唱片${track ? ` ${track.track}` : ""}`}>
      <span className="tp-spinner" aria-hidden="true"><span className="tp-vinyl" /><span className="tp-label">{track ? <AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="lg" /> : <Headphones size={28} />}</span></span>
      <span className="tp-disc-state" data-loading={loading} aria-hidden="true">{playing || loading ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}</span>
    </button>
    {listeners.map(listener => <button type="button" className="orbit-listener tp-peer" key={listener.id} aria-label={`查看在线歌曲 ${listener.track}`} aria-pressed={listener.id === selectedId} data-upper={listener.position.y < 35} style={{ left: `${listener.position.x}%`, top: `${listener.position.y}%` } as CSSProperties} onClick={() => onSelect(listener)}>
      <AlbumTile coverUrl={listener.coverUrl} accent={listener.accent} size="sm" />
    </button>)}
  </section>;
}
