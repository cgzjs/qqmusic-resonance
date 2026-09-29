"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { ArrowLeftRight, Clock3, Gift, Headphones, Heart, Play, Radar, Radio, X, type LucideIcon } from "lucide-react";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import { sceneLabels } from "@/lib/resonance/demo-data";
import type { AudioTrack, MusicLibrary } from "@/lib/resonance/types";
import { findCatalogTrack } from "@/lib/resonance/catalog";
import type { OnlineExchangeRecord } from "@/lib/resonance/exchange-protocol";
import { exchangesOnDay, type ReceivedSong } from "@/lib/resonance/received-songs";
import { ReceivedSongs, clockTime, dayLabel } from "./ReceivedSongs";

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

const eventVerbs = { discover: "遇见", listen: "试听", exchange: "交换" };
const eventIcons: Record<"discover" | "listen" | "exchange" | "online", LucideIcon> = { discover: Radar, listen: Headphones, exchange: ArrowLeftRight, online: Radio };
const trackLabel = (track: AudioTrack | undefined) => track?.available ? `试听 ${track.track}` : `歌曲已移除 ${track?.track ?? "未知歌曲"}`;

/**
 * 足迹页按内容换形态：今天的唱片叠 + 分段切换；
 * 足迹是带类型节点的时间线，收到的歌是回信，收藏是封面墙，待听是紧凑队列。
 */
export function JourneySummary({ library, onPlayTrack, onRemoveFavorite, onRemoveLater, onReturn, accountBacked = false, onlineHistory = [], onlineExchanges = [], received = [], onReadExchange, initialTab = "history", onTabChange }: JourneySummaryProps) {
  const [tab, setTab] = useState<JourneyTab>(initialTab);
  const unread = received.filter(item => item.unread).length;
  const [limit, setLimit] = useState(20);
  const today = new Date().toDateString();
  const todayEvents = library.events.filter(event => new Date(event.createdAt).toDateString() === today);
  const ids = tab === "favorites" ? library.favoriteIds : library.listenLaterIds;
  // 一起听时的送歌是单向的：gift 标出是送给 TA 还是 TA 送的；旧版交换两首都有，按一对显示。
  const history = [...new Map([
    ...onlineExchanges.filter(event => event.sentTrackId || event.receivedTrackId).map(event => ({ id: `online:${event.roomId}:${event.id}`, type: "exchange" as const, trackId: (event.sentTrackId ?? event.receivedTrackId)!, listenerId: "", scene: null, createdAt: new Date(event.completedAt).toISOString(), receivedTrackId: event.sentTrackId ? event.receivedTrackId : undefined, gift: !event.sentTrackId ? "received" as const : !event.receivedTrackId ? "sent" as const : undefined, origin: "online-exchange" as const })),
    ...library.events.filter(event => event.type !== "exchange" || event.receivedTrackId).map(event => ({ ...event, id: `demo:${event.id}`, origin: "demo" as const })),
    ...onlineHistory.map(event => ({ id: `listen:${event.id}`, type: "listen" as const, trackId: event.trackId, listenerId: "", scene: null, createdAt: new Date(event.listenedAt).toISOString(), receivedTrackId: undefined, origin: "online" as const })),
  ].map(event => [event.id, event])).values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const stats = [
    { label: "今日遇见", value: new Set(todayEvents.filter(event => event.type === "discover").map(event => event.listenerId)).size },
    { label: "今日交换", value: exchangesOnDay(history.filter(event => event.type === "exchange").map(event => ({ receivedAt: Date.parse(event.createdAt) }))) },
    { label: "我的收藏", value: library.favoriteIds.length },
  ];
  // 今天经过的歌（交换取收到的那首），叠成一摞唱片放在页首。
  const todayCovers = [...new Map(history.filter(event => new Date(event.createdAt).toDateString() === today).map(event => findCatalogTrack(event.receivedTrackId ?? event.trackId)).filter(track => track !== undefined).map(track => [track.id, track])).values()].slice(0, 4);
  const tabs = [
    { id: "history", label: "足迹", count: 0 },
    { id: "received", label: "收到的歌", count: unread },
    { id: "favorites", label: "收藏", count: library.favoriteIds.length },
    { id: "later", label: "待听", count: library.listenLaterIds.length },
  ] as const;
  const shown = history.slice(0, limit);

  return (
    <section className="tp-journey">
      <header className="tp-today">
        <div className="tp-stack" aria-hidden="true" data-count={todayCovers.length}>
          {todayCovers.length ? todayCovers.map((track, index) => <span key={track.id} style={{ "--i": index, "--n": todayCovers.length } as CSSProperties}><AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="md" /></span>) : <span className="tp-stack-empty" />}
        </div>
        <div className="tp-today-copy">
          <h2>我的音乐足迹</h2>
          <div className="stat-grid tp-stats">{stats.map(({ label, value }) => <article key={label} data-zero={value === 0}><strong>{value}</strong><span>{label}</span></article>)}</div>
        </div>
      </header>

      <div className="tp-segments" role="group" aria-label="音乐记录分类">{tabs.map(item => {
        const label = item.id === "received" ? unread ? `收到的歌，${unread} 首未读` : item.label : item.count ? `${item.label} ${item.count}` : item.label;
        return <button type="button" key={item.id} aria-pressed={tab === item.id} aria-label={label} onClick={() => { setTab(item.id); onTabChange?.(item.id); }}>
          {item.label}{item.id === "received" ? unread > 0 && <b className="tp-badge" aria-hidden="true">{unread}</b> : item.count > 0 && <small aria-hidden="true">{item.count}</small>}
        </button>;
      })}</div>

      <div className="tp-journey-body">
        {tab === "received" ? <ReceivedSongs items={received} onRead={onReadExchange ?? (() => Promise.resolve(false))} onPlay={onPlayTrack} />
          : tab === "history" ? history.length === 0
            ? <div className="tp-empty"><Radar aria-hidden="true" /><h3>还没有音乐足迹</h3><p>去附近发现一首歌，记录会从这里开始。</p>{onReturn && <button type="button" className="tp-btn tp-btn--quiet" onClick={onReturn}>去附近看看</button>}</div>
            : <div className="tp-timeline">{shown.map((event, index) => {
              const gift = "gift" in event ? event.gift : undefined;
              const exchange = event.type === "exchange" && !!event.receivedTrackId;
              const track = findCatalogTrack(event.receivedTrackId ?? event.trackId);
              const sent = findCatalogTrack(event.trackId);
              const date = new Date(event.createdAt);
              const newDay = index === 0 || date.toDateString() !== new Date(shown[index - 1].createdAt).toDateString();
              const kind = event.origin === "online" ? "online" : event.type;
              const Icon = gift ? Gift : eventIcons[kind];
              const verb = eventVerbs[event.type];
              const what = gift === "sent" ? "一起听时送给 TA" : gift === "received" ? "一起听时 TA 送你" : event.origin === "online-exchange" ? "一起听时交换" : event.origin === "online" ? "和 TA 一起听" : event.scene ? `在${sceneLabels[event.scene]}${verb}` : verb;
              return <Fragment key={event.id}>{newDay && <h3 className="tp-day">{dayLabel(date)}</h3>}<article className="journey-event tp-event" data-kind={kind}>
                <span className="tp-node" aria-hidden="true"><Icon size={14} strokeWidth={2} /></span>
                <p className="tp-event-meta"><span>{what}</span><time dateTime={event.createdAt}>{clockTime(date)}</time></p>
                <button type="button" className="tp-track" disabled={!track?.available} onClick={() => track?.available && onPlayTrack(track)} aria-label={trackLabel(track)}>
                  {exchange ? <span className="tp-pair"><AlbumTile coverUrl={sent?.coverUrl} accent={sent?.accent ?? "#8ca49a"} size="sm" /><ArrowLeftRight size={12} aria-hidden="true" /><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" /></span> : <AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" />}
                  <span className="tp-track-copy"><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{!track?.available ? "歌曲已从歌单移除，记录仍保留" : exchange ? `送出《${sent?.track ?? event.trackId}》，收到这首` : track.artist}</small></span>
                  <Play className="tp-track-go" size={16} aria-hidden="true" />
                </button>
              </article></Fragment>;
            })}{history.length > limit && <button type="button" className="tp-btn tp-btn--quiet tp-more" onClick={() => setLimit(value => value + 20)}>显示更多记录</button>}</div>
          : ids.length === 0
            ? <div className="tp-empty">{tab === "favorites" ? <Heart aria-hidden="true" /> : <Clock3 aria-hidden="true" />}<h3>{tab === "favorites" ? "还没有收藏" : "待听列表为空"}</h3><p>{tab === "favorites" ? "试听时收藏，或留住 TA 送你的歌" : "收到歌曲时，可以先加入稍后再听"}</p></div>
            : tab === "favorites"
              ? <ul className="tp-wall">{ids.map(id => {
                const track = findCatalogTrack(id);
                return <li key={id} data-available={!!track?.available}>
                  <button type="button" className="tp-wall-play" disabled={!track?.available} onClick={() => track?.available && onPlayTrack(track)} aria-label={trackLabel(track)}>
                    <AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="md" />
                    <strong>{track?.track ?? "已移除的歌曲"}</strong><small>{track?.available ? track.artist : "已从歌单移除"}</small>
                  </button>
                  <button type="button" className="tp-wall-remove" aria-label={`取消收藏 ${track?.track ?? id}`} onClick={() => onRemoveFavorite(id)}><X size={14} aria-hidden="true" /></button>
                </li>;
              })}</ul>
              : <ul className="tp-queue">{ids.map(id => {
                const track = findCatalogTrack(id);
                return <li key={id}>
                  <button type="button" className="tp-track" disabled={!track?.available} onClick={() => track?.available && onPlayTrack(track)} aria-label={trackLabel(track)}>
                    <AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" />
                    <span className="tp-track-copy"><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{track?.available ? track.artist : "已从歌单移除，可移出此列表"}</small></span>
                  </button>
                  <button type="button" className="tp-icon-btn" aria-label={`移出待听 ${track?.track ?? id}`} onClick={() => onRemoveLater(id)}><X size={16} aria-hidden="true" /></button>
                </li>;
              })}</ul>}
      </div>
      <p className="tp-footnote">{accountBacked ? "记录保存在当前账号" : "记录保存在这台设备"}</p>
    </section>
  );
}
