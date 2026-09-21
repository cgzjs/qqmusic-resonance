"use client";
import { useState } from "react";
import { Headphones, Send } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { NearbyListener } from "@/lib/resonance/types";
import type { useNearby } from "@/hooks/useNearby";
import { AlbumTile } from "./AlbumTile";
import { OrbitRadar } from "./OrbitRadar";

type Props = { nearby: ReturnType<typeof useNearby>; currentTrackId: string | null };
const results = { accepted: "邀请已接受，正在连接。", declined: "这次暂未同频，继续遇见。", cancelled: "邀请已撤回或歌曲已更新。", expired: "邀请已到期或对方已离线。", pending: "等待回应" };

export function OnlineNearbyPanel({ nearby, currentTrackId }: Props) {
  const { snapshot, busy, error, ready, online, now, request, enterSession } = nearby;
  const [selectedId, setSelectedId] = useState("");
  const invite = snapshot?.invite;
  const pending = invite?.status === "pending";
  const incoming = invite?.to === snapshot?.self.id;
  const song = audioTracks.find(track => track.id === invite?.trackId);
  const seconds = invite && snapshot ? Math.max(0, Math.ceil((invite.expiresAt - now) / 1000)) : 0;
  const peers = (snapshot?.peers ?? []).filter(peer => audioTracks.some(track => track.id === peer.trackId));
  const selected = peers.find(peer => peer.id === selectedId) ?? peers[0];
  const currentTrack = audioTracks.find(track => track.id === currentTrackId);
  const visiblePeers = selected && !peers.slice(0, 6).some(peer => peer.id === selected.id) ? [selected, ...peers.filter(peer => peer.id !== selected.id).slice(0, 5)] : peers.slice(0, 6);
  const radarPeers: NearbyListener[] = visiblePeers.map((peer, index) => {
    const track = audioTracks.find(track => track.id === peer.trackId)!;
    const angle = index * Math.PI * 2 / visiblePeers.length - Math.PI / 3;
    return { ...track, id: peer.id, audioTrackId: track.id, similarity: 0, distanceLabel: "附近", genres: [], sharedArtists: [], suggestions: [], position: { x: 50 + 30 * Math.cos(angle), y: 50 + 30 * Math.sin(angle) } };
  });
  return <section className="online-nearby-panel">
    <div className="radar-heading"><div><h2>附近在听</h2><p className="nearby-subtitle">从一首歌，认识一个人。</p></div><span className="scene-bar__count">{peers.length} 人</span></div>
    <div className="plugin-discovery"><div><strong>{snapshot ? ready ? "正在匿名分享这首歌" : "正在确认发现状态" : "由你决定什么时候被发现"}</strong><p>{snapshot ? "邀请对方，一起听这首歌。" : "开启后，向附近的人展示当前歌曲。"}</p></div><button type="button" className={snapshot ? "room-secondary" : "room-primary"} disabled={busy || !!snapshot?.ticket || (!snapshot && (!currentTrackId || !online))} onClick={() => void request(snapshot ? "stop" : "start", snapshot ? {} : { trackId: currentTrackId })}>{busy ? "正在更新" : snapshot ? "暂停发现" : "开启发现"}</button></div>
    {invite && <section className="nearby-invite" aria-label="同频邀请"><p className="section-kicker">{pending ? incoming ? "收到同频邀请" : "邀请已送达" : "邀请状态"}</p><h3>{incoming ? invite.fromAlias : invite.toAlias}</h3><p role="status">{pending ? `一起听《${song?.track}》${incoming ? "，由你带领播放。" : "，等待 TA 接受。"}` : results[invite.status]}</p>{pending && <><small>{seconds > 0 ? `约 ${seconds} 秒后失效` : "邀请已到期，正在确认结果"}</small><div className="nearby-actions">{incoming ? <><button className="room-primary" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "accept" })}><Headphones size={17} aria-hidden="true" />接受，一起听</button><button className="room-secondary" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "decline" })}>暂时不了</button></> : <button className="room-secondary" disabled={busy || !ready || seconds === 0} onClick={() => void request("respond", { inviteId: invite.id, decision: "cancel" })}>撤回邀请</button>}</div></>}{snapshot?.ticket && <button className="room-primary" disabled={!ready} onClick={() => enterSession(snapshot)}>进入同频</button>}</section>}
    <div className="nearby-orbit"><div className="nearby-orbit-heading"><h3>同频雷达</h3><span>{peers.length ? "点选封面，遇见同频" : "让音乐带来下一次相遇"}</span></div>
      <OrbitRadar active={!!snapshot && ready && online} track={currentTrack} listeners={radarPeers} selectedId={selected?.id ?? ""} onSelect={listener => { setSelectedId(listener.id); document.getElementById("selected-nearby-person")?.scrollIntoView({ block: "nearest" }); }} />
      {!peers.length && <p className="orbit-empty-caption" role="status">{snapshot ? "还没有其他听众，先听着。" : "开启发现，听众会出现在轨道上。"}</p>}
    </div>
    {peers.length > 0 && <div className="nearby-listeners">{peers.filter(peer => peer.id === selected?.id).map(peer => {
      const peerTrack = audioTracks.find(track => track.id === peer.trackId)!;
      return <article id="selected-nearby-person" className="nearby-person" key={peer.id}><AlbumTile coverUrl={peerTrack.coverUrl} accent={peerTrack.accent} size="md" /><div><small>{peer.alias} · 正在听</small><h3>{peerTrack.track}</h3><p>{peerTrack.artist}</p></div><button className="room-secondary" disabled={busy || !ready || pending || !!error} onClick={() => void request("invite", { targetId: peer.id })}><Send size={16} aria-hidden="true" />邀请同频</button></article>;
    })}</div>}
    {peers.length > 1 && <div className="orbit-listener-picker" aria-label="全部听众">{peers.map(peer => <button type="button" key={peer.id} aria-pressed={selected?.id === peer.id} onClick={() => setSelectedId(peer.id)}>{peer.alias} · {audioTracks.find(track => track.id === peer.trackId)?.track}</button>)}</div>}
    {error && <p className="room-error" role="alert">{error}</p>}
  </section>;
}
