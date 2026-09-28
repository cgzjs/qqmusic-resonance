"use client";
import { Fragment, useState } from "react";
import { ChevronDown, Music2, Play } from "lucide-react";
import { findCatalogTrack } from "@/lib/resonance/catalog";
import type { ReceivedSong } from "@/lib/resonance/received-songs";
import type { AudioTrack } from "@/lib/resonance/types";
import { AlbumTile } from "./AlbumTile";

type Props = { items: ReceivedSong[]; onRead: (id: string) => Promise<boolean>; onPlay: (track: AudioTrack) => void };

/** 今天 / 昨天 / 9月28日（跨年时带年份），足迹和收到的歌共用。 */
export function dayLabel(date: Date, today = new Date()) {
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" as const } : {}) });
}
export const clockTime = (date: Date) => date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** 回信：TA 回的歌在前，自己送出的那首作为角标压在封面一角。 */
export function ReceivedSongs({ items, onRead, onPlay }: Props) {
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  async function markRead(item: ReceivedSong) {
    if (!item.unread || savingId) return;
    setSavingId(item.id); setErrorId(null);
    try { if (!await onRead(item.id)) setErrorId(item.id); }
    catch { setErrorId(item.id); }
    finally { setSavingId(null); }
  }
  if (!items.length) return <div className="tp-empty"><Music2 aria-hidden="true" /><h3>还没有收到的歌</h3><p>交换一首，收到的音乐会留在这里。</p></div>;
  return <div className="received-songs tp-letters">{items.slice(0, limit).map((item, index) => {
    const track = findCatalogTrack(item.receivedTrackId), sent = findCatalogTrack(item.sentTrackId);
    const opened = openedId === item.id;
    const panelId = `received-${item.id}`;
    const date = new Date(item.receivedAt);
    const newDay = index === 0 || date.toDateString() !== new Date(items[index - 1].receivedAt).toDateString();
    return <Fragment key={item.id}>{newDay && <h3 className="tp-day">{dayLabel(date)}</h3>}<article className="tp-letter" data-unread={item.unread} data-open={opened}>
      <button type="button" className="tp-letter-open" aria-expanded={opened} aria-controls={panelId} aria-label={`查看回歌 ${track?.track ?? "已移除的歌曲"}${item.unread ? "，未读" : ""}`} disabled={!!savingId} onClick={() => {
        setOpenedId(opened ? null : item.id); setErrorId(null);
        if (!opened) void markRead(item);
      }}>
        <span className="tp-letter-art"><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="md" /><AlbumTile className="tp-letter-sent" coverUrl={sent?.coverUrl} accent={sent?.accent ?? "#8ca49a"} size="sm" /></span>
        <span className="tp-track-copy"><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{track?.artist ?? "歌曲资料暂不可用"}</small></span>
        <span className="tp-letter-meta">{item.unread && <span className="tp-unread">未读</span>}<time dateTime={date.toISOString()}>{clockTime(date)}</time></span>
        <ChevronDown className="tp-letter-chevron" size={16} aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!opened} className="tp-letter-detail">
        <p>你送出《{sent?.track ?? "已移除的歌曲"}》，TA 回了这首。</p>
        {track?.available ? <button type="button" className="tp-btn tp-btn--quiet" onClick={() => onPlay(track)}><Play size={16} aria-hidden="true" />试听这首歌</button> : <p>歌曲已下架，交换记录仍保留。</p>}
        {savingId === item.id && <p role="status">正在更新已读状态…</p>}
        {errorId === item.id && <p className="tp-error" role="alert">已读状态未保存。<button type="button" className="tp-link" onClick={() => void markRead(item)}>重试</button></p>}
      </div>
    </article></Fragment>;
  })}{items.length > limit && <button type="button" className="tp-btn tp-btn--quiet tp-more" onClick={() => setLimit(value => value + 20)}>更多回歌</button>}</div>;
}
