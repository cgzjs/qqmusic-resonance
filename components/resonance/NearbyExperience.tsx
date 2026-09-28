"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useNearby } from "@/hooks/useNearby";
import { useHost } from "./HostProvider";
import { HostStatus, MockHostPanel, AccountControls } from "./HostStatus";
import type { HostSession } from "@/lib/resonance/host-protocol";
import { CurrentPlaybackBar } from "./CurrentPlaybackBar";
import { demoHost } from "@/lib/resonance/demo-host";
import { ResonanceExperience } from "./ResonanceExperience";
import { OnlineNearbyPanel } from "./OnlineNearbyPanel";
import { AppearanceToggle } from "./Appearance";
import { CoverBackdrop } from "./CoverBackdrop";
import { coverThemeStyle } from "@/lib/resonance/cover-theme";

export function NearbyExperience({ initialSource = "online" }: { initialSource?: "demo" | "online" }) {
  const host = useHost();
  const track = audioTracks.find(item => item.id === host.trackId) ?? audioTracks[0];
  const signedIn = host.status === "ready" && !!host.session;
  return <main className="room-page nearby-page plugin-page integrated-plugin music-app cover-scope tp-app" data-authenticated={host.status === "ready"} style={coverThemeStyle(track)}><CoverBackdrop coverUrl={track?.coverUrl} /><section className="tp-shell">
    <header className="tp-top"><Link href="/" className="tp-brand"><Radio size={22} strokeWidth={1.8} aria-hidden="true" />同频</Link><div className="tp-top-actions"><AppearanceToggle compact />{signedIn && host.session ? <details className="music-account-menu tp-account"><summary aria-label={`账号：${host.session.displayName.replace(/^模拟/, "")}`}><span className="tp-avatar" aria-hidden="true">{host.session.displayName.endsWith("B") ? "B" : "A"}</span></summary><AccountControls /></details> : null}</div></header>
    {signedIn && host.session ? <ConnectedNearby key={host.session.token} session={host.session} initialSource={initialSource} /> : <HostStatus />}
    {!signedIn && <MockHostPanel />}
  </section></main>;
}

function ConnectedNearby({ session, initialSource }: { session: HostSession; initialSource: "demo" | "online" }) {
  const host = useHost();
  const nearby = useNearby(session);
  const { snapshot, request, busy, ready } = nearby;
  const track = audioTracks.find(track => track.id === host.trackId);
  useEffect(() => {
    if (!ready || !snapshot || snapshot.ticket || snapshot.self.trackId === track?.id) return;
    void request(track ? "track" : "stop", track ? { trackId: track.id } : {});
  }, [track, snapshot, request, ready]);
  const invite = snapshot?.invite;
  const notice = invite?.status === "pending" ? invite.to === snapshot?.self.id ? "收到在线同频邀请" : "在线邀请正在等待回应" : null;
  return <>
    {host.dataError && <div className="room-error integrated-error" role="alert">{host.dataError}<button className="room-secondary" onClick={host.refreshData}>重试读取</button></div>}
    {host.dataLoading ? <p className="plugin-host-status" role="status">正在读取账号足迹…</p> : <ResonanceExperience playbackHeader={player => <CurrentPlaybackBar player={player} />} onTrackChange={demoHost.setTrack} initialSource={initialSource} onlinePanel={player => <OnlineNearbyPanel nearby={nearby} currentTrackId={track?.id ?? null} player={player} />} onlineNotice={notice} incomingInvite={invite?.status === "pending" && invite.to === snapshot?.self.id ? invite : null} onlineActive={!!snapshot && !snapshot.ticket} onPauseOnline={() => { if (!busy) void request("stop", {}); }} />}
  </>;
}
