"use client";

import { useState } from "react";
import { Heart, Headphones, Music2, Play, Radio, X } from "lucide-react";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import { Button } from "@/components/ui/button";
import { sceneLabels } from "@/lib/resonance/demo-data";
import type { AudioTrack, MusicLibrary } from "@/lib/resonance/types";
import { findCatalogTrack } from "@/lib/resonance/catalog";
import type { OnlineExchangeRecord } from "@/lib/resonance/exchange-protocol";
import { receivedSongs, exchangesOnDay, type ReceivedSong } from "@/lib/resonance/received-songs";
import { ReceivedSongs } from "./ReceivedSongs";

export type JourneyTab = "history" | "received" | "favorites" | "later";

type JourneySummaryProps = {
  accountBacked?: boolean;
  onlineHistory?: { id: string; trackId: string; listenedAt: number }[];
  onlineExchanges?: OnlineExchangeRecord[];
  library: MusicLibrary;
  onPlayTrack: (track: AudioTrack) => void;
  onRemoveFavorite: (id: string) => void;
  onRemoveLater: (id: string) => void;
  onReturn?: () => void;
  received?: ReceivedSong[];
  onReadExchange?: (id: string) => Promise<boolean>;
  initialTab?: JourneyTab;
  onTabChange?: (tab: JourneyTab) => void;
};

const eventLabels = { discover: "遇见", listen: "试听", exchange: "交换" };

export function JourneySummary({ library, onPlayTrack, onRemoveFavorite, onRemoveLater, onReturn, accountBacked = false, onlineHistory = [], onlineExchanges = [], received = [], onReadExchange, initialTab = "history", onTabChange }: JourneySummaryProps) {
  const [tab, setTab] = useState<JourneyTab>(initialTab);
  const unread = received.filter(item => item.unread).length;
  const [limit, setLimit] = useState(20);
  const today = new Date().toDateString();
  const todayEvents = library.events.filter(event => new Date(event.createdAt).toDateString() === today);
  const completedExchanges = receivedSongs({ events: library.events, onlineExchanges, readExchangeIds: [] });
  const stats = [
    { label: "今日遇见", value: new Set(todayEvents.filter(event => event.type === "discover").map(event => event.listenerId)).size, icon: Headphones },
    { label: "今日交换", value: exchangesOnDay(completedExchanges), icon: Music2 },
    { label: "我的收藏", value: library.favoriteIds.length, icon: Heart },
  ];
  const ids = tab === "favorites" ? library.favoriteIds : library.listenLaterIds;
  const history = [...new Map([
    ...onlineExchanges.map(event => ({ id: `online:${event.roomId}:${event.id}`, type: "exchange" as const, trackId: event.sentTrackId, listenerId: "", scene: null, createdAt: new Date(event.completedAt).toISOString(), receivedTrackId: event.receivedTrackId, origin: "online-exchange" as const })),
    ...library.events.filter(event => event.type !== "exchange" || event.receivedTrackId).map(event => ({ ...event, id: `demo:${event.id}`, origin: "demo" as const })),
    ...onlineHistory.map(event => ({ id: `listen:${event.id}`, type: "listen" as const, trackId: event.trackId, listenerId: "", scene: null, createdAt: new Date(event.listenedAt).toISOString(), receivedTrackId: undefined, origin: "online" as const })),
  ].map(event => [event.id, event])).values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <section className="screen-view journey-view">
      <header className="journey-header"><h2>我的音乐足迹</h2></header>
      <div className="stat-grid">{stats.map(({ label, value, icon: Icon }) => <article key={label}><Icon aria-hidden="true" size={17} /><span>{label}</span><strong>{value}</strong></article>)}</div>
      <div className="library-tabs" role="group" aria-label="音乐记录分类">{([{ id: "history", label: "足迹" }, { id: "received", label: "收到的歌" }, { id: "favorites", label: `收藏 ${library.favoriteIds.length}` }, { id: "later", label: `待听 ${library.listenLaterIds.length}` }] as const).map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} aria-label={item.id === "received" && unread ? `收到的歌，${unread} 首未读` : item.label} onClick={() => { setTab(item.id); onTabChange?.(item.id); }}>{item.label}{item.id === "received" && unread > 0 && <span className="unread-count" aria-hidden="true">{unread}</span>}</button>)}</div>
      {tab === "received" ? <ReceivedSongs items={received} onRead={onReadExchange ?? (() => Promise.resolve(false))} onPlay={onPlayTrack} /> : tab === "history" ? history.length === 0 ? <div className="library-empty"><Radio aria-hidden="true" /><h3>还没有音乐足迹</h3><p>去雷达发现一首歌，记录会从这里开始。</p></div> : <div className="journey-events">{history.slice(0, limit).map(event => {
        const track = findCatalogTrack(event.type === "exchange" ? event.receivedTrackId! : event.trackId);
        const sent = findCatalogTrack(event.trackId);
        const date = new Date(event.createdAt);
        return <article className="journey-event" key={event.id}><div className="journey-event__meta"><span>{event.origin === "online-exchange" ? "在线交换" : event.origin === "online" ? "在线同频" : `${eventLabels[event.type]} · ${event.scene ? sceneLabels[event.scene] : ""}`}</span><time dateTime={event.createdAt}>{date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} {date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></div><button type="button" className="saved-track" disabled={!track?.available} onClick={() => track?.available && onPlayTrack(track)} aria-label={track?.available ? `试听 ${track.track}` : `歌曲已移除 ${track?.track ?? "未知歌曲"}`}><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" /><span><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{!track?.available ? "歌曲已从歌单移除，记录仍保留" : event.type === "exchange" ? `送出《${sent?.track ?? event.trackId}》，收到这首` : track?.artist}</small></span><Play size={17} aria-hidden="true" /></button></article>;
      })}{history.length > limit && <Button variant="ghost" onClick={() => setLimit(value => value + 20)}>显示更多记录</Button>}</div> : ids.length === 0 ? <div className="library-empty"><Heart aria-hidden="true" /><h3>{tab === "favorites" ? "还没有收藏" : "待听列表为空"}</h3><p>{tab === "favorites" ? "试听时收藏，或留住交换收到的歌。" : "收到歌曲时，可以先加入稍后再听。"}</p></div> : <div className="saved-tracks">{ids.map(id => {
        const track = findCatalogTrack(id);
        return <div className="saved-track-row" key={id}><button type="button" className="saved-track" disabled={!track?.available} onClick={() => track?.available && onPlayTrack(track)} aria-label={track?.available ? `试听 ${track.track}` : `歌曲已移除 ${track?.track ?? "未知歌曲"}`}><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" /><span><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{track?.available ? track.artist : "已从歌单移除，可移出此列表"}</small></span><Play size={17} aria-hidden="true" /></button><button className="remove-saved" type="button" aria-label={`${tab === "favorites" ? "取消收藏" : "移出待听"} ${track?.track ?? id}`} onClick={() => tab === "favorites" ? onRemoveFavorite(id) : onRemoveLater(id)}><X size={16} aria-hidden="true" /></button></div>;
      })}</div>}
      {onReturn && <Button className="primary-action journey-return" onClick={onReturn}>回到音乐雷达</Button>}
      <p className="journey-disclaimer">{accountBacked ? "保存到当前账号" : "保存在这台设备"}</p>
    </section>
  );
}
