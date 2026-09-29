"use client";
import { useState } from "react";
import { Headphones, Send, Sparkles } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { INVITE_MS } from "@/lib/resonance/nearby-protocol";
import type { NearbyListener } from "@/lib/resonance/types";
import type { useNearby } from "@/hooks/useNearby";
import { AlbumTile } from "./AlbumTile";
import { OrbitRadar } from "./OrbitRadar";
import { BlockListenerButton } from "./ListenerSafety";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";

type Props = { nearby: ReturnType<typeof useNearby>; currentTrackId: string | null; player?: ResonancePlayer };
const results = { accepted: "已接受，马上开始", declined: "这次没约上", cancelled: "邀请已取消。", expired: "邀请已到期", pending: "等待回应" };

export function OnlineNearbyPanel({ nearby, currentTrackId, player }: Props) {
  const { snapshot, busy, error, ready, online, now, request } = nearby;
  const [selectedId, setSelectedId] = useState("");
  const [quiet, setQuiet] = useState(false);
  const invite = snapshot?.invite;
  const pending = invite?.status === "pending";
  const incoming = invite?.to === snapshot?.self.id;
  const song = audioTracks.find(track => track.id === invite?.trackId);
  const seconds = invite && snapshot ? Math.max(0, Math.ceil((invite.expiresAt - now) / 1000)) : 0;
  const peers = (snapshot?.peers ?? []).filter(peer => audioTracks.some(track => track.id === peer.trackId));
  const selected = peers.find(peer => peer.id === selectedId) ?? peers[0];
  const selectedTrack = selected && audioTracks.find(track => track.id === selected.trackId);
  const currentTrack = audioTracks.find(track => track.id === currentTrackId);
  const isCurrent = !!currentTrack && player?.track?.id === currentTrack.id;
  const playing = isCurrent && player?.status === "playing";
  const loading = isCurrent && player?.status === "loading" && player.wantsPlayback;
  const visiblePeers = selected && !peers.slice(0, 6).some(peer => peer.id === selected.id) ? [selected, ...peers.filter(peer => peer.id !== selected.id).slice(0, 5)] : peers.slice(0, 6);
  const radarPeers: NearbyListener[] = visiblePeers.map((peer, index) => {
    const track = audioTracks.find(track => track.id === peer.trackId)!;
    const angle = index * Math.PI * 2 / visiblePeers.length - Math.PI / 3;
    return { ...track, id: peer.id, audioTrackId: track.id, similarity: 0, distanceLabel: "附近", genres: [], sharedArtists: [], suggestions: [], position: { x: 50 + 40 * Math.cos(angle), y: 50 + 40 * Math.sin(angle) } };
  });
  const title = snapshot ? ready ? "正在分享给附近" : "正在连接…" : "附近在听";
  const status = !snapshot ? online ? "匿名分享你在听的歌" : "网络已断开" : peers.length ? `附近 ${peers.length} 人在听，点封面看看` : "附近暂时没人";
  return <section className="online-nearby-panel tp-nearby">
    <div className="tp-stage">
      <OrbitRadar active={!!snapshot && ready && online} playing={playing} loading={loading} motion={!quiet} onTogglePlayback={player && currentTrack ? () => { if (isCurrent && player.wantsPlayback) player.pause(); else void player.playTrack(currentTrack); } : undefined} track={currentTrack} listeners={radarPeers} selectedId={selected?.id ?? ""} onSelect={listener => { setSelectedId(listener.id); document.getElementById("selected-nearby-person")?.scrollIntoView({ block: "nearest" }); }} />
      <button type="button" className="orbit-motion-toggle tp-icon-btn tp-motion" aria-label={quiet ? "打开唱片动画" : "关闭唱片动画"} title={quiet ? "打开唱片动画" : "关闭唱片动画"} aria-pressed={!quiet} onClick={() => setQuiet(value => !value)}><Sparkles size={18} aria-hidden="true" /></button>
    </div>
    <div className="tp-discovery">
      <div className="tp-discovery-copy"><h2>{title}</h2><p role="status">{status}</p></div>
      <button type="button" role="switch" aria-checked={!!snapshot} className="tp-switch" disabled={busy || !!snapshot?.ticket || (!snapshot && (!currentTrackId || !online))} onClick={() => void request(snapshot ? "stop" : "start", snapshot ? {} : { trackId: currentTrackId })}><span>{busy ? "稍等…" : "附近可见"}</span><span className="tp-switch-track" aria-hidden="true" /></button>
    </div>
    {invite && <section className="tp-sheet tp-invite" aria-label="一起听邀请">
      <p className="tp-sheet-who">{pending ? incoming ? "邀请你一起听" : "已发出邀请" : "邀请结果"}</p>
      <h3>{incoming ? invite.fromAlias : invite.toAlias}</h3>
      <p className="tp-sheet-copy" role="status">{pending ? `一起听《${song?.track}》` : results[invite.status]}</p>
      {pending && <>
        <div className="tp-timer" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, seconds * 1000 / INVITE_MS)})` }} /></div>
        <small className="tp-timer-copy">{seconds > 0 ? `还剩 ${seconds} 秒` : "邀请已到期"}</small>
        <div className="tp-actions">{incoming ? <><button type="button" className="tp-btn tp-btn--primary" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "accept" })}><Headphones size={18} aria-hidden="true" />接受，一起听</button><button type="button" className="tp-btn tp-btn--quiet" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "decline" })}>暂时不了</button></> : <button type="button" className="tp-btn tp-btn--quiet" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "cancel" })}>撤回邀请</button>}</div>
        <BlockListenerButton key={invite.id} target={{ targetId: incoming ? invite.from : invite.to }} alias={incoming ? invite.fromAlias : invite.toAlias} disabled={busy || !ready || seconds === 0} onBlocked={() => void request("state")} />
      </>}
    </section>}
    {selected && selectedTrack && <article id="selected-nearby-person" className="tp-sheet" key={selected.id}>
      <div className="tp-sheet-row"><AlbumTile coverUrl={selectedTrack.coverUrl} accent={selectedTrack.accent} size="md" /><div className="tp-sheet-meta"><p className="tp-sheet-who">{selected.alias} 正在听</p><h3>{selectedTrack.track}</h3><p className="tp-sheet-copy">{selectedTrack.artist}</p></div></div>
      <div className="tp-actions"><button type="button" className="tp-btn tp-btn--primary" disabled={busy || !ready || pending || !!error} onClick={() => void request("invite", { targetId: selected.id })}><Send size={18} aria-hidden="true" />邀请 TA 一起听</button><BlockListenerButton target={{ targetId: selected.id }} alias={selected.alias} disabled={busy || !ready} onBlocked={() => void request("state")} /></div>
    </article>}
    {peers.length > 1 && <div className="tp-chips" role="group" aria-label="附近的人">{peers.map(peer => <button type="button" className="tp-chip" key={peer.id} aria-pressed={selected?.id === peer.id} onClick={() => setSelectedId(peer.id)}><b>{peer.alias}</b>{audioTracks.find(track => track.id === peer.trackId)?.track}</button>)}</div>}
    {error && <p className="room-error" role="alert">{error}</p>}
  </section>;
}
