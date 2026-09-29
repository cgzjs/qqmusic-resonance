"use client";
import { useEffect, useState } from "react";
import { Gift, Heart, Send, X } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { useListeningRoom } from "@/hooks/useListeningRoom";
import { useHost } from "./HostProvider";
import { AlbumTile } from "./AlbumTile";
import { ExchangeSignal } from "./ReactionDock";

// 送 TA 一首：单向，送出即到，不用等 TA 回一首。
// RoomSession 以礼物 id 作 key，新礼物到来时本组件重新挂载，选歌状态自然收起。
export function RoomExchangePanel({ connection }: { connection: ReturnType<typeof useListeningRoom> }) {
  const host = useHost();
  const { room, role, exchangeRequest, exchangeError, sendExchange, retryExchange } = connection;
  const gift = room?.exchange;
  const [picking, setPicking] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [trackId, setTrackId] = useState(room?.playback.trackId ?? audioTracks[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const connected = connection.connection === "connected" && !room?.closed;
  const bothOnline = connected && room?.hostConnected && room.guestConnected;
  const isBusy = exchangeRequest !== "idle";
  const selected = audioTracks.find(track => track.id === trackId) ?? audioTracks[0];
  const mine = gift?.from === role;
  const giftTrack = audioTracks.find(track => track.id === gift?.offeredTrackId);
  const refreshData = host.refreshData;
  const savedForSelf = gift && role ? gift.saved[role] || (host.data.onlineExchanges ?? []).some(record => record.id === gift.id && record.roomId === room?.id) : false;
  useEffect(() => {
    if (!savedForSelf) return;
    const timer = setTimeout(refreshData, 0); return () => clearTimeout(timer);
  }, [gift?.id, savedForSelf, refreshData]);
  if (!room?.exchangeEnabled || !role || !selected) return null;
  const showGift = !picking && !!gift && gift.id !== dismissedId && !!giftTrack;
  async function save(destination: "favorite" | "later") {
    if (!giftTrack) return;
    setSaving(true); setSaveNote("");
    const ok = await host.save(destination, giftTrack.id);
    setSaving(false); setSaveNote(ok ? destination === "favorite" ? "已收藏到你的账号" : "已加入你的待听列表" : "保存失败，请重试");
  }
  function close() { setPicking(false); if (gift) setDismissedId(gift.id); }
  const favorite = !!giftTrack && host.data.favoriteIds.includes(giftTrack.id);
  return <section id="room-exchange-panel" tabIndex={-1} className="tp-sheet tp-exchange" aria-label="送 TA 一首">
    <div className="tp-exchange-head"><div><Gift size={18} aria-hidden="true" /><h2>送 TA 一首</h2></div>{(picking || showGift) && <button type="button" aria-label="收起" className="tp-icon-btn" onClick={close}><X size={18} aria-hidden="true" /></button>}</div>
    {!picking && !showGift && <><p className="tp-exchange-lead">挑一首你喜欢的，TA 马上就能收到</p><button type="button" className="tp-btn tp-btn--quiet" disabled={!bothOnline || isBusy} onClick={() => setPicking(true)}><Send size={16} aria-hidden="true" />挑一首</button></>}
    {picking && <>
      <ExchangeSignal sending={exchangeRequest === "sending"} received={false} />
      <fieldset className="tp-exchange-options" disabled={!bothOnline || isBusy}><legend>送哪一首？</legend>{audioTracks.map(track => <label key={track.id} data-selected={selected.id === track.id}><AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="sm" /><span><strong>{track.track}</strong><small>{track.artist}</small></span><input type="radio" name="live-gift-song" aria-label={`送出歌曲 ${track.track}`} checked={selected.id === track.id} onChange={() => setTrackId(track.id)} /></label>)}</fieldset>
      <button type="button" className="tp-btn tp-btn--primary tp-wide" disabled={!bothOnline || isBusy} onClick={() => sendExchange(selected.id)}><Send size={16} aria-hidden="true" />{exchangeRequest === "sending" ? "正在送出…" : `送出《${selected.track}》`}</button>
    </>}
    {showGift && (mine
      ? <div className="tp-exchange-result"><AlbumTile coverUrl={giftTrack.coverUrl} accent={giftTrack.accent} size="md" /><h3>{giftTrack.track}</h3><p className="tp-exchange-sync" role="status">{savedForSelf ? "已送给 TA，存进了你的足迹" : "已送给 TA"}</p><button type="button" className="tp-btn tp-btn--quiet tp-wide" disabled={!bothOnline || isBusy} onClick={() => setPicking(true)}>再送一首</button></div>
      : <div className="tp-exchange-result"><p>TA 送你一首</p><AlbumTile coverUrl={giftTrack.coverUrl} accent={giftTrack.accent} size="md" /><h3>{giftTrack.track}</h3><p>{giftTrack.artist}</p><div className="tp-actions"><button type="button" className="tp-btn tp-btn--primary" disabled={saving || host.dataLoading || favorite} onClick={() => void save("favorite")}><Heart size={16} aria-hidden="true" />{favorite ? "已收藏" : saving ? "正在保存…" : "收藏这首"}</button><button type="button" className="tp-btn tp-btn--quiet" disabled={saving || host.dataLoading || favorite || host.data.listenLaterIds.includes(giftTrack.id)} onClick={() => void save("later")}>{host.data.listenLaterIds.includes(giftTrack.id) ? "已加入待听" : "稍后再听"}</button></div>{saveNote && <p className="tp-exchange-sync" role="status">{saveNote}</p>}<button type="button" className="tp-btn tp-btn--quiet tp-wide" disabled={!bothOnline || isBusy} onClick={() => setPicking(true)}>也送 TA 一首</button></div>)}
    {!bothOnline && connected && <p className="tp-exchange-sync">TA 暂时掉线，回来后再送</p>}
    {exchangeError && <p className="room-error" role="alert">{exchangeError}</p>}
    {exchangeRequest === "uncertain" && <button type="button" className="tp-btn tp-btn--quiet tp-wide" disabled={!connected} onClick={retryExchange}>再确认一次是否送出</button>}
  </section>;
}
