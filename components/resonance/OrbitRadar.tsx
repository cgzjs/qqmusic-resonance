"use client";
import { useSyncExternalStore, type CSSProperties } from "react";
import { Headphones, Pause, Play } from "lucide-react";
import type { AudioTrack, NearbyListener } from "@/lib/resonance/types";
import { AlbumTile } from "./AlbumTile";

type Props = { active: boolean; playing?: boolean; loading?: boolean; motion?: boolean; onTogglePlayback?: () => void; track?: AudioTrack; listeners: NearbyListener[]; selectedId: string; onSelect: (listener: NearbyListener) => void };
const subscribeVisibility = (notify: () => void) => { document.addEventListener("visibilitychange", notify); return () => document.removeEventListener("visibilitychange", notify); };
const readVisible = () => document.visibilityState !== "hidden";
const serverVisible = () => true;

export function OrbitRadar({ active, playing = false, loading = false, motion = true, onTogglePlayback, track, listeners, selectedId, onSelect }: Props) {
  const visible = useSyncExternalStore(subscribeVisibility, readVisible, serverVisible);
  const selected = listeners.find(listener => listener.id === selectedId);
  const route = selected ? `M 200 200 Q ${200 + (selected.position.x - 50) * 2 + 22} ${200 + (selected.position.y - 50) * 2 - 22} ${selected.position.x * 4} ${selected.position.y * 4}` : "";
  return <section className="orbit-map" aria-label="附近音乐雷达" data-active={active} data-playing={playing} data-motion={motion && visible} data-crowded={listeners.length > 1}>
    <svg className="orbit-lines" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="72" /><circle cx="200" cy="200" r="120" /><circle cx="200" cy="200" r="174" />
      {Array.from({ length: 24 }, (_, index) => <path key={index} d={`M 200 18 V ${index % 6 === 0 ? 29 : 23}`} transform={`rotate(${index * 15} 200 200)`} />)}
      {selected && <><path className="orbit-connection" d={route} />{active && motion && visible && <circle className="orbit-signal" r="3"><animateMotion dur="3.8s" repeatCount="indefinite" path={route} /></circle>}</>}
    </svg>
    <button type="button" className="orbit-self" disabled={!track || !onTogglePlayback} onClick={onTogglePlayback} aria-label={`${playing || loading ? "暂停" : "播放"}唱片${track ? ` ${track.track}` : ""}`}>
      <span className="orbit-aura" aria-hidden="true" /><span className="orbit-ripple orbit-ripple--one" aria-hidden="true" /><span className="orbit-ripple orbit-ripple--two" aria-hidden="true" />
      <span className="orbit-disc"><span className="orbit-vinyl" aria-hidden="true"><i /></span>{track ? <AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="md" /> : <Headphones size={28} aria-hidden="true" />}</span>
      <span className="orbit-disc-control" aria-hidden="true">{playing || loading ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</span>
      <span className="orbit-self-label"><span className="orbit-equalizer" aria-hidden="true"><i /><i /><i /><i /></span>{loading ? "正在加载" : playing ? "正在播放" : "点击听听"}</span>
    </button>
    {listeners.map(listener => <button type="button" className="orbit-listener" key={listener.id} aria-label={`查看在线歌曲 ${listener.track}`} aria-pressed={listener.id === selectedId} data-upper={listener.position.y < 35} style={{ left: `${listener.position.x}%`, top: `${listener.position.y}%`, "--orbit-accent": listener.accent } as CSSProperties} onClick={() => onSelect(listener)}>
      <span className="orbit-listener-cover"><AlbumTile coverUrl={listener.coverUrl} accent={listener.accent} size="sm" /><span className="orbit-online-dot" aria-hidden="true" /></span>
      <span className="orbit-listener-title">{listener.track}</span>
    </button>)}
    <span className="orbit-corner" aria-hidden="true">{active ? "正在发现" : "待开启"}<i /></span>
  </section>;
}
