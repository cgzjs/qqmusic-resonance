"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, Disc3 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useNearby } from "@/hooks/useNearby";
import { useHost } from "./HostProvider";
import { HostStatus, MockHostPanel } from "./HostStatus";
import type { HostSession } from "@/lib/resonance/host-protocol";
import { AlbumTile } from "./AlbumTile";
import { ResonanceExperience } from "./ResonanceExperience";
import { OnlineNearbyPanel } from "./OnlineNearbyPanel";

export function NearbyExperience({ initialSource = "demo" }: { initialSource?: "demo" | "online" }) {
  const host = useHost();
  return <main className="room-page nearby-page plugin-page integrated-plugin"><section className="room-panel">
    <header className="room-header"><Link href="/"><ArrowLeft size={16} aria-hidden="true" />同频</Link><span>QQ MUSIC / 共听插件</span></header>
    {host.status === "ready" && host.session ? <ConnectedNearby key={host.session.token} session={host.session} initialSource={initialSource} /> : <HostStatus />}
    <MockHostPanel />
  </section></main>;
}

function ConnectedNearby({ session, initialSource }: { session: HostSession; initialSource: "demo" | "online" }) {
  const host = useHost();
  const nearby = useNearby(session);
  const { snapshot, request, busy } = nearby;
  const [saving, setSaving] = useState(false);
  const track = audioTracks.find(track => track.id === host.trackId);
  const favorite = !!track && host.data.favoriteIds.includes(track.id);
  useEffect(() => {
    if (!snapshot || snapshot.ticket || snapshot.self.trackId === track?.id) return;
    void request(track ? "track" : "stop", track ? { trackId: track.id } : {});
  }, [track, snapshot, request]);
  async function saveFavorite() {
    if (!track) return;
    setSaving(true); await host.save(favorite ? "unfavorite" : "favorite", track.id); setSaving(false);
  }
  const invite = snapshot?.invite;
  const notice = invite?.status === "pending" ? invite.to === snapshot?.self.id ? "收到在线同频邀请" : "在线邀请正在等待回应" : null;
  return <>
    <div className="plugin-identity-bar"><div className="plugin-account"><span className="plugin-avatar" aria-hidden="true">{session.displayName.endsWith("B") ? "B" : "A"}</span><div><strong>{session.displayName}</strong><small>宿主登录态 · 模拟</small></div><span className="plugin-anonymous">对外匿名</span></div>
      <article className="plugin-current" aria-label="宿主当前歌曲">{track ? <><AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="sm" /><div><small>宿主当前歌曲 · 模拟</small><h2>{track.track}</h2></div><button className="plugin-heart" aria-label={favorite ? "取消收藏当前歌曲" : "收藏当前歌曲"} aria-pressed={favorite} disabled={saving || host.dataLoading || !!host.dataError} onClick={() => void saveFavorite()}><Heart size={20} fill={favorite ? "currentColor" : "none"} /></button></> : <><Disc3 size={24} aria-hidden="true" /><p>{audioTracks.length ? "宿主还没有选择歌曲，仍可体验模拟雷达。" : "当前歌单暂无可播放歌曲。"}</p></>}</article>
    </div>
    {host.dataError && <div className="room-error integrated-error" role="alert">{host.dataError}<button className="room-secondary" onClick={host.refreshData}>重试读取</button></div>}
    {host.dataLoading ? <p className="plugin-host-status" role="status">正在读取账号足迹…</p> : <ResonanceExperience initialSource={initialSource} onlinePanel={<OnlineNearbyPanel nearby={nearby} currentTrackId={track?.id ?? null} />} onlineNotice={notice} onlineActive={!!snapshot && !snapshot.ticket} onPauseOnline={() => { if (!busy) void request("stop", {}); }} />}
  </>;
}
