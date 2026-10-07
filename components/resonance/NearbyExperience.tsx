"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { Radio, Settings2 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useNearby } from "@/hooks/useNearby";
import { useFollowerNotification } from "@/hooks/useOnlineNotifications";
import { useHost } from "./HostProvider";
import { HostStatus, AccountControls } from "./HostStatus";
import type { HostSession } from "@/lib/resonance/host-protocol";
import { CurrentPlaybackBar } from "./CurrentPlaybackBar";
import { demoHost } from "@/lib/resonance/demo-host";
import { ResonanceExperience } from "./ResonanceExperience";
import { OnlineNearbyPanel } from "./OnlineNearbyPanel";
import { RoomSession } from "./RoomSession";
import { AppearanceToggle } from "./Appearance";
import { CoverBackdrop } from "./CoverBackdrop";
import { coverThemeStyle } from "@/lib/resonance/cover-theme";

export function NearbyExperience() {
  const host = useHost();
  const track = audioTracks.find(item => item.id === host.trackId) ?? audioTracks[0];
  const signedIn = host.status === "ready" && !!host.session;
  return <main className="room-page nearby-page plugin-page integrated-plugin music-app cover-scope tp-app" data-authenticated={host.status === "ready"} style={coverThemeStyle(track)}><CoverBackdrop coverUrl={track?.coverUrl} /><section className="tp-shell">
    <header className="tp-top"><Link href="/" className="tp-brand"><Radio size={22} strokeWidth={1.8} aria-hidden="true" />同频</Link><div className="tp-top-actions"><AppearanceToggle compact />{signedIn && host.session ? <details className="music-account-menu tp-account"><summary aria-label="体验设置"><Settings2 size={20} aria-hidden="true" /></summary><AccountControls /></details> : null}</div></header>
    {signedIn && host.session ? <ConnectedNearby key={host.session.token} session={host.session} initialSource="demo" /> : <HostStatus />}
  </section></main>;
}

function ConnectedNearby({ session, initialSource }: { session: HostSession; initialSource: "demo" | "online" }) {
  const host = useHost();
  const nearby = useNearby(session);
  const { snapshot, request, busy, ready, room, joined, leaveSession } = nearby;
  const track = audioTracks.find(track => track.id === host.trackId);
  useEffect(() => {
    if (!ready || !snapshot || snapshot.ticket || snapshot.self.trackId === track?.id) return;
    void request(track ? "track" : "stop", track ? { trackId: track.id } : {});
  }, [track, snapshot, request, ready]);
  const trackId = track?.id;
  // 结束一起听后回到附近，并重新对附近可见。
  const exitRoom = useCallback(() => {
    leaveSession();
    if (trackId) void request("start", { trackId });
  }, [leaveSession, request, trackId]);
  const invitation = snapshot?.ticket?.role === "host" ? snapshot.ticket : null;
  const acceptInvitation = useCallback(() => {
    if (invitation && !busy && ready && nearby.online) void request("accept", { roomId: invitation.roomId });
  }, [invitation, busy, ready, nearby.online, request]);
  const declineInvitation = useCallback(() => {
    if (invitation && !busy && ready && nearby.online) void request("decline", { roomId: invitation.roomId });
  }, [invitation, busy, ready, nearby.online, request]);
  useFollowerNotification(invitation, acceptInvitation, declineInvitation);
  return <>
    {host.dataError && <div className="room-error integrated-error" role="alert">{host.dataError}<button className="room-secondary" onClick={host.refreshData}>重新加载</button></div>}
    {host.dataLoading ? <p className="plugin-host-status" role="status">正在加载你的足迹…</p> : <ResonanceExperience roomView={room ? player => <RoomSession key={room} variant="inline" roomId={room} peerAlias={joined?.peerAlias} player={player} onExit={exitRoom} onTrack={demoHost.setTrack} /> : null} playbackHeader={room ? undefined : player => <CurrentPlaybackBar player={player} />} currentTrackId={track?.id ?? null} onTrackChange={demoHost.setTrack} initialSource={initialSource} onlinePanel={player => <OnlineNearbyPanel nearby={nearby} currentTrackId={track?.id ?? null} player={player} />} onlineActive={!!snapshot && !snapshot.ticket} modeSwitchDisabled={busy || !!snapshot?.ticket} onPauseOnline={() => void request("stop", {})} />}
  </>;
}
