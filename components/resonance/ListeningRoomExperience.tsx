"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useResonancePlayer } from "@/hooks/useResonancePlayer";
import { useHost } from "./HostProvider";
import { HostStatus, MockHostPanel } from "./HostStatus";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceToggle } from "./Appearance";
import { CoverBackdrop } from "./CoverBackdrop";
import { RoomSession } from "./RoomSession";
import { coverThemeStyle } from "@/lib/resonance/cover-theme";

export function ListeningRoomExperience({ roomId }: { roomId: string }) {
  const host = useHost();
  if (host.status !== "ready" || !host.session) {
    const track = audioTracks.find(item => item.id === host.trackId) ?? audioTracks[0];
    return <main className="room-page music-app cover-scope tp-app tp-room" data-authenticated="false" style={coverThemeStyle(track)}><CoverBackdrop coverUrl={track?.coverUrl} /><section className="tp-shell">
      <header className="tp-top tp-room-top"><Link href="/nearby" className="tp-icon-btn" aria-label="返回附近"><ArrowLeft size={20} aria-hidden="true" /></Link><div className="tp-room-title"><h1>一起听</h1></div><AppearanceToggle compact /></header>
      <HostStatus /><MockHostPanel />
    </section></main>;
  }
  return <ConnectedRoom key={host.session.token} roomId={roomId} />;
}

// 已结束的房间别让附近页再原地恢复。
function forgetRoom(accountId: string | undefined, roomId: string) {
  const key = `resonance.nearby-room.${accountId}.active`;
  try { if (accountId && sessionStorage.getItem(key) === roomId) sessionStorage.removeItem(key); } catch { /* 忽略 */ }
}

function ConnectedRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const host = useHost();
  const accountId = host.session?.accountId;
  const { audioRef, player } = useResonancePlayer();
  const track = audioTracks.find(item => item.id === player.track?.id);
  // 只用于刷新和断线重连；平时一起听在附近页原地展开。
  return <main className="room-page music-app cover-scope tp-app tp-room" data-authenticated="true" data-audio-status={player.status} data-audio-duration={player.duration} data-audio-track={player.track?.id} style={coverThemeStyle(track)}><CoverBackdrop coverUrl={track?.coverUrl} /><audio ref={audioRef} preload="auto" hidden /><section className="tp-shell">
    <RoomSession variant="page" roomId={roomId} player={player} onExit={() => { forgetRoom(accountId, roomId); router.push("/nearby?mode=online"); }} headerExtra={<AppearanceToggle compact />} />
    <MockHostPanel />
  </section><Toaster position="bottom-right" containerAriaLabel="一起听提醒" closeButton duration={8000} visibleToasts={2} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} /></main>;
}
