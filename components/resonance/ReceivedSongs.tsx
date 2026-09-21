"use client";
import { Fragment, useState } from "react";
import { ChevronDown, Music2, Play } from "lucide-react";
import { findCatalogTrack } from "@/lib/resonance/catalog";
import type { ReceivedSong } from "@/lib/resonance/received-songs";
import type { AudioTrack } from "@/lib/resonance/types";
import { AlbumTile } from "./AlbumTile";

type Props = { items: ReceivedSong[]; onRead: (id: string) => Promise<boolean>; onPlay: (track: AudioTrack) => void };

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
  if (!items.length) return <div className="library-empty"><Music2 aria-hidden="true" /><h3>还没有收到的歌</h3><p>交换一首，收到的音乐会留在这里。</p></div>;
  return <div className="received-songs">{items.slice(0, limit).map((item, index) => {
    const track = findCatalogTrack(item.receivedTrackId), sent = findCatalogTrack(item.sentTrackId);
    const opened = openedId === item.id;
    const panelId = `received-${item.id}`;
    const date = new Date(item.receivedAt);
    const newDay = index === 0 || date.toDateString() !== new Date(items[index - 1].receivedAt).toDateString();
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const dateLabel = date.toDateString() === today.toDateString() ? "今天" : date.toDateString() === yesterday.toDateString() ? "昨天" : date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", ...(date.getFullYear() !== today.getFullYear() ? {year: "numeric" as const} : {}) });
    return <Fragment key={item.id}>{newDay && <h3 className="received-date-group">{dateLabel}</h3>}<article className="received-song-item" data-unread={item.unread}>
      <button type="button" className="saved-track received-song-open" aria-expanded={opened} aria-controls={panelId} aria-label={`查看回歌 ${track?.track ?? "已移除的歌曲"}${item.unread ? "，未读" : ""}`} disabled={!!savingId} onClick={() => {
        setOpenedId(opened ? null : item.id); setErrorId(null);
        if (!opened) void markRead(item);
      }}><AlbumTile coverUrl={track?.coverUrl} accent={track?.accent ?? "#8ca49a"} size="sm" /><span><strong>{track?.track ?? "已移除的歌曲"}</strong><small>{track?.artist ?? "歌曲资料暂不可用"}</small></span><span className="received-row-meta">{item.unread && <span className="received-unread">未读</span>}<time dateTime={date.toISOString()}>{date.toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit", hour12: false})}</time></span><ChevronDown size={16} aria-hidden="true" /></button>
      <div id={panelId} hidden={!opened} className="received-song-detail">
        <p>你送出《{sent?.track ?? "已移除的歌曲"}》，TA 回了这首。</p>
        {track?.available ? <button type="button" className="room-secondary" onClick={() => onPlay(track)}><Play size={16} aria-hidden="true" />试听这首歌</button> : <p>歌曲已下架，交换记录仍保留。</p>}
        {savingId === item.id && <p role="status">正在更新已读状态…</p>}
        {errorId === item.id && <p className="room-error" role="alert">已读状态未保存。<button type="button" className="room-secondary" onClick={() => void markRead(item)}>重试</button></p>}
      </div>
    </article></Fragment>;
  })}{items.length > limit && <button type="button" className="room-secondary" onClick={() => setLimit(value => value + 20)}>更多回歌</button>}</div>;
}
