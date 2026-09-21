"use client";
import { useEffect, useState } from "react";
import { Heart, Send, X } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { useListeningRoom } from "@/hooks/useListeningRoom";
import { useHost } from "./HostProvider";
import { AlbumTile } from "./AlbumTile";
import { ExchangeSignal, InteractionGlyph } from "./ReactionDock";

export function RoomExchangePanel({ connection }: { connection: ReturnType<typeof useListeningRoom> }) {
  const host = useHost();
  const { room, role, exchangeRequest, exchangeError, sendExchange, retryExchange } = connection;
  const exchange = room?.exchange;
  const [open, setOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState(audioTracks[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [now, setNow] = useState(0);
  const connected = connection.connection === "connected" && !room?.closed;
  const bothOnline = connected && room?.hostConnected && room.guestConnected;
  const pending = exchange?.status === "pending";
  const sender = exchange?.from === role;
  const completed = exchange?.status === "completed";
  const isBusy = exchangeRequest !== "idle";
  const selected = audioTracks.find(track => track.id === trackId && (!pending || track.id !== exchange?.offeredTrackId)) ?? audioTracks.find(track => !pending || track.id !== exchange?.offeredTrackId)!;
  const received = completed ? audioTracks.find(track => track.id === (sender ? exchange.responseTrackId : exchange.offeredTrackId)) : null;
  const sent = completed ? audioTracks.find(track => track.id === (sender ? exchange.offeredTrackId : exchange.responseTrackId)) : null;
  const offered = audioTracks.find(track => track.id === exchange?.offeredTrackId);
  const refreshData = host.refreshData;
  const savedForSelf = exchange && role ? exchange.saved[role] || (host.data.onlineExchanges ?? []).some(record => record.id === exchange.id && record.roomId === room?.id) : false;
  useEffect(() => {
    if (!pending) return;
    const initial = setTimeout(() => setNow(Date.now() + connection.offset), 0);
    const timer = setInterval(() => setNow(Date.now() + connection.offset), 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [pending, connection.offset, exchange?.id]);
  useEffect(() => {
    if (!savedForSelf) return;
    const timer = setTimeout(refreshData, 0); return () => clearTimeout(timer);
  }, [exchange?.id, savedForSelf, refreshData]);
  if (!room?.exchangeEnabled || !role || audioTracks.length < 2) return null;
  const showing = open || pending || (!!exchange && exchange.id !== dismissedId);
  const remaining = exchange ? Math.min(60, Math.max(0, Math.ceil((exchange.expiresAt - (now || exchange.createdAt)) / 1000))) : 0;
  async function save(destination: "favorite" | "later") {
    if (!received) return;
    setSaving(true); setSaveNote("");
    const ok = await host.save(destination, received.id);
    setSaving(false); setSaveNote(ok ? destination === "favorite" ? "已收藏到你的账号" : "已加入你的待听列表" : "保存失败，请重试");
  }
  function start() { setOpen(true); setSaveNote(""); if (exchange) setDismissedId(exchange.id); }
  const newOffer = open && !pending && (!exchange || exchange.id === dismissedId);
  return <section id="room-exchange-panel" tabIndex={-1} className="room-exchange" aria-label="双人交换一首">
    <div className="room-exchange-heading"><div><InteractionGlyph kind="exchange" /><h2>交换一首喜欢的歌</h2></div>{showing && !pending && <button aria-label="收起交换" className="exchange-close" onClick={() => { setOpen(false); if (exchange) setDismissedId(exchange.id); }}><X size={18} aria-hidden="true" /></button>}</div>
    {!showing && <><p>你送一首，TA 回一首。相遇之后，音乐留下。</p><button className="room-secondary" disabled={!bothOnline || isBusy} onClick={start}><Send size={16} aria-hidden="true" />交换一首</button></>}
    {showing && <>
      <ExchangeSignal sending={exchangeRequest === "sending"} received={completed && !newOffer} />
      {pending && <div className="room-exchange-offer"><p>{sender ? "你送给 TA" : "TA 送给你"}</p><strong>{offered?.track}</strong><span role="status">{sender ? "等待对方选歌回应" : "选一首不同的歌，回应这次相遇"}</span><small>约 {remaining} 秒后到期</small></div>}
      {(newOffer || (pending && !sender)) && <>
        <fieldset className="room-track-options" disabled={!bothOnline || isBusy || (pending && remaining === 0)}><legend>{pending ? "选一首回应 TA" : "你想送出哪一首？"}</legend>{audioTracks.filter(track => !pending || track.id !== exchange?.offeredTrackId).map(track => <label key={track.id} data-selected={selected.id === track.id}><AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="sm" /><span><strong>{track.track}</strong><small>{track.artist}</small></span><input type="radio" name="live-exchange-song" aria-label={`交换歌曲 ${track.track}`} checked={selected.id === track.id} onChange={() => setTrackId(track.id)} /></label>)}</fieldset>
        <button className="room-primary" disabled={!bothOnline || isBusy || (pending && remaining === 0)} onClick={() => sendExchange(pending ? "respond" : "offer", { trackId: selected.id, ...(pending ? { exchangeId: exchange!.id } : {}) })}><Send size={16} aria-hidden="true" />{exchangeRequest === "sending" ? "正在确认…" : pending ? "送出这首，完成交换" : "送给 TA"}</button>
      </>}
      {pending && <button className="room-secondary" disabled={!connected || isBusy} onClick={() => sendExchange(sender ? "cancel" : "decline", { exchangeId: exchange.id })}>{sender ? "撤回这首歌" : "这次先不了"}</button>}
      {completed && !newOffer && received && <div className="room-exchange-result"><p>你送出《{sent?.track}》</p><AlbumTile coverUrl={received.coverUrl} accent={received.accent} size="md" /><h3>{received.track}</h3><p>这是 TA 回应你的音乐</p><p className="room-exchange-sync" role="status">{exchange.saved.host && exchange.saved.guest ? "已记录到双方足迹" : savedForSelf ? "你的足迹已保存，另一端保存状态待确认" : "交换已确认，正在保存足迹；会话结束后也会继续补存"}</p><div className="nearby-actions"><button className="room-primary" disabled={saving || host.dataLoading || host.data.favoriteIds.includes(received.id)} onClick={() => void save("favorite")}><Heart size={16} aria-hidden="true" />{host.data.favoriteIds.includes(received.id) ? "已收藏" : saving ? "正在保存…" : "收藏这首"}</button><button className="room-secondary" disabled={saving || host.dataLoading || host.data.favoriteIds.includes(received.id) || host.data.listenLaterIds.includes(received.id)} onClick={() => void save("later")}>{host.data.listenLaterIds.includes(received.id) ? "已加入待听" : "稍后再听"}</button></div>{saveNote && <p role="status">{saveNote}</p>}</div>}
      {exchange && !pending && !completed && !newOffer && <p role="status">{{ declined: sender ? "TA 暂时不想交换，继续听歌吧。" : "你已婉拒这次交换。", cancelled: sender ? "你已撤回这次交换。" : "TA 已撤回这次交换。", expired: "这份交换已到期。", ended: "会话已结束，未完成的交换已取消。" }[exchange.status as "declined" | "cancelled" | "expired" | "ended"]}</p>}
      {exchange && !pending && !newOffer && <button className="room-secondary" disabled={!bothOnline || isBusy} onClick={start}>再交换一首</button>}
    </>}
    {!bothOnline && connected && <p className="room-exchange-sync">等对方恢复连接后再送出，已有交换仍按原时间到期。</p>}
    {exchangeError && <p className="room-error" role="alert">{exchangeError}</p>}
    {exchangeRequest === "uncertain" && <button className="room-secondary" disabled={!connected} onClick={retryExchange}>重试确认上次操作</button>}
  </section>;
}
