"use client";
import { useState } from "react";
import { Headphones, Radio, Send } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { NearbyListener } from "@/lib/resonance/types";
import type { useNearby } from "@/hooks/useNearby";
import { AlbumTile } from "./AlbumTile";
import { MusicRadar } from "./MusicRadar";

type Props = { nearby: ReturnType<typeof useNearby>; currentTrackId: string | null };
const results = { accepted: "邀请已接受，正在连接。", declined: "这次暂未同频，继续遇见。", cancelled: "邀请已撤回或歌曲已更新。", expired: "邀请已到期或对方已离线。", pending: "等待回应" };

export function OnlineNearbyPanel({ nearby, currentTrackId }: Props) {
  const { snapshot, busy, error, request, enterSession } = nearby;
  const [selectedId, setSelectedId] = useState("");
  const invite = snapshot?.invite;
  const pending = invite?.status === "pending";
  const incoming = invite?.to === snapshot?.self.id;
  const song = audioTracks.find(track => track.id === invite?.trackId);
  const seconds = invite && snapshot ? Math.max(0, Math.ceil((invite.expiresAt - snapshot.serverTime) / 1000)) : 0;
  const peers = (snapshot?.peers ?? []).filter(peer => audioTracks.some(track => track.id === peer.trackId));
  const selected = peers.find(peer => peer.id === selectedId) ?? peers[0];
  const selectedTrack = audioTracks.find(track => track.id === selected?.trackId);
  const radarPeers: NearbyListener[] = peers.slice(0, 6).map((peer, index) => {
    const track = audioTracks.find(track => track.id === peer.trackId)!;
    const angle = index * Math.PI / 3 - Math.PI / 2;
    return { ...track, id: peer.id, audioTrackId: track.id, similarity: 0, distanceLabel: "演示区域", genres: [], sharedArtists: [], suggestions: [], position: { x: 50 + 32 * Math.cos(angle), y: 50 + 32 * Math.sin(angle) } };
  });
  return <section className="online-nearby-panel">
    <div className="radar-heading"><div><p className="section-kicker"><Radio size={14} aria-hidden="true" /> 在线听众 · 演示区域</p><h2>听见此刻在线的人</h2></div><span className="scene-bar__count">{peers.length} 人</span></div>
    <div className="plugin-discovery"><div><strong>{snapshot ? "正在匿名分享宿主歌曲" : "由你决定什么时候被发现"}</strong><p>连接真实客户端，区域和节点位置均为示意。</p></div><button type="button" className={snapshot ? "room-secondary" : "room-primary"} disabled={busy || !!snapshot?.ticket || (!snapshot && !currentTrackId)} onClick={() => void request(snapshot ? "stop" : "start", snapshot ? {} : { trackId: currentTrackId })}>{busy ? "正在更新" : snapshot ? "暂停发现" : "开启发现"}</button></div>
    {invite && <section className="nearby-invite" aria-label="同频邀请"><p className="section-kicker">{pending ? incoming ? "收到同频邀请" : "邀请已送达" : "邀请状态"}</p><h3>{incoming ? invite.fromAlias : invite.toAlias}</h3><p role="status">{pending ? `一起听《${song?.track}》${incoming ? "，由你带领播放。" : "，等待 TA 接受。"}` : results[invite.status]}</p>{pending && <><small>约 {seconds} 秒后失效</small><div className="nearby-actions">{incoming ? <><button className="room-primary" disabled={busy} onClick={() => void request("respond", { inviteId: invite.id, decision: "accept" })}><Headphones size={17} aria-hidden="true" />接受，一起听</button><button className="room-secondary" disabled={busy} onClick={() => void request("respond", { inviteId: invite.id, decision: "decline" })}>暂时不了</button></> : <button className="room-secondary" disabled={busy} onClick={() => void request("respond", { inviteId: invite.id, decision: "cancel" })}>撤回邀请</button>}</div></>}{snapshot?.ticket && <button className="room-primary" onClick={() => enterSession(snapshot)}>进入同频</button>}</section>}
    <div className="radar-wrap"><MusicRadar showCenter={peers.length > 0} showSimilarity={false} listeners={radarPeers} selectedId={selected?.id ?? ""} onSelect={listener => setSelectedId(listener.id)} />{peers.length === 0 && <div className="radar-empty" role="status"><Radio aria-hidden="true" /><strong>{snapshot ? "这里还很安静" : "发现尚未开启"}</strong><span>{snapshot ? "等待另一位听众开启发现" : "开启后才会显示在线听众"}</span></div>}</div>
    {selected && selectedTrack && <article className="nearby-person"><AlbumTile coverUrl={selectedTrack.coverUrl} accent={selectedTrack.accent} size="sm" /><div><small>{selected.alias} · 匿名在线</small><h3>{selectedTrack.track}</h3><p>{selectedTrack.artist}</p></div><button className="room-secondary" disabled={busy || pending || !!error} onClick={() => void request("invite", { targetId: selected.id })}><Send size={16} aria-hidden="true" />邀请同频</button></article>}
    {peers.length > 1 && <div className="online-peer-list" aria-label="选择在线听众">{peers.map(peer => <button key={peer.id} aria-pressed={peer.id === selected?.id} onClick={() => setSelectedId(peer.id)}>{peer.alias} · {audioTracks.find(track => track.id === peer.trackId)?.track}</button>)}</div>}
    {error && <p className="room-error" role="alert">{error}</p>}
    <p className="demo-notice">接受邀请后可同步听歌、回应和交换一首；雷达位置仅为示意。</p>
  </section>;
}
