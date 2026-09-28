"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headphones, Pause, Play, Users, Volume2 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { formatTime } from "@/lib/resonance/library";
import { useListeningRoom } from "@/hooks/useListeningRoom";
import { useResonancePlayer } from "@/hooks/useResonancePlayer";
import { useRoomAudio } from "@/hooks/useRoomAudio";
import { useClientReady } from "@/hooks/useClientReady";
import { ListeningArtwork } from "./ListeningArtwork";
import { useHost } from "./HostProvider";
import { HostStatus, MockHostPanel } from "./HostStatus";
import { ReactionDock } from "./ReactionDock";
import { RoomExchangePanel } from "./RoomExchangePanel";
import { Toaster } from "@/components/ui/sonner";
import { useRoomExchangeNotification } from "@/hooks/useOnlineNotifications";
import { AppearanceToggle } from "./Appearance";
import { BlockListenerButton } from "./ListenerSafety";
import { CoverBackdrop } from "./CoverBackdrop";
import { coverThemeStyle } from "@/lib/resonance/cover-theme";

const connectionLabels = { idle: "等待加入", connecting: "正在连接", connected: "已连接", reconnecting: "正在恢复并同步状态", error: "连接未完成", closed: "本次同频已结束" };
const percent = (value: number, max: number) => ({ "--p": `${max ? Math.min(100, value / max * 100) : 0}%` }) as CSSProperties;

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

function ConnectedRoom({ roomId }: { roomId: string }) {
  const host = useHost();
  const saveHistory = host.save;
  const router = useRouter();
  const isClientReady = useClientReady();
  const roomConnection = useListeningRoom(roomId);
  const { room, role, connection, error } = roomConnection;
  const { audioRef, player } = useResonancePlayer();
  const { needsGesture, enableAudio } = useRoomAudio(room, connection, roomConnection.offset, player, roomConnection.isSynchronized);
  const [draftPosition, setDraftPosition] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const selectedTrack = audioTracks.find(track => track.id === room?.playback.trackId);
  const connected = connection === "connected" && !room?.closed;
  useRoomExchangeNotification(room, role, connected);
  const canControl = connected && role === "host";
  const [quiet, setQuiet] = useState(false);
  const isBusy = connection === "connecting" || connection === "reconnecting";
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    if (player.status !== "playing" || !selectedTrack || recorded.current.has(selectedTrack.id)) return;
    recorded.current.add(selectedTrack.id);
    void saveHistory("listen", selectedTrack.id, crypto.randomUUID());
  }, [player.status, selectedTrack, saveHistory]);

  function commitSeek() {
    const value = draftRef.current;
    draftRef.current = null; setDraftPosition(null);
    if (value !== null && canControl) roomConnection.command("seek", { position: value });
  }
  function leave() {
    roomConnection.leave(); player.stop(); router.push("/nearby?mode=online");
  }

  const total = player.duration || selectedTrack?.duration || 0;
  const position = draftPosition ?? player.currentTime;

  // 房间由当前曲目染色：背景是它的模糊封面，你和 TA 之间的线穿过这张唱片。
  return <main className="room-page music-app cover-scope tp-app tp-room" data-authenticated="true" data-audio-status={player.status} data-audio-duration={player.duration} data-audio-track={player.track?.id} style={coverThemeStyle(selectedTrack)}><CoverBackdrop coverUrl={selectedTrack?.coverUrl} /><audio ref={audioRef} preload="auto" hidden /><section className="tp-shell">
    <header className="tp-top tp-room-top"><button type="button" className="tp-icon-btn" aria-label="返回附近" onClick={leave}><ArrowLeft size={20} aria-hidden="true" /></button><div className="tp-room-title"><h1>一起听</h1><span className="tp-room-status" data-connected={connected} role="status">{connectionLabels[connection]}</span></div><AppearanceToggle compact /></header>
    <div className="tp-room-body">
      {room?.exchange?.status === "pending" && role && room.exchange.from !== role && <button type="button" className="integrated-invite-notice" aria-label="查看待回应交换" onClick={() => { const panel = document.getElementById("room-exchange-panel"); panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true }); }}><span role="status">TA 送来一首歌，等你回应</span><span>查看</span></button>}
      {!room && <div className="tp-join"><Users size={32} aria-hidden="true" /><p>双方已同意，一起听这首歌。<br />分享歌曲的一方带领播放，音量各自调整。</p><button type="button" className="tp-btn tp-btn--primary" disabled={!isClientReady || isBusy || connection === "closed"} onClick={roomConnection.join}><Headphones size={18} aria-hidden="true" />{isBusy ? "正在连接" : "开启声音并加入"}</button></div>}
      {room && <>
        {selectedTrack && <div className="tp-now"><ListeningArtwork key={selectedTrack.id} track={selectedTrack} mode="online" role={role} outgoing={roomConnection.outgoingReaction} incoming={roomConnection.incomingReaction} selfOnline={connected && (role === "host" ? room.hostConnected : room.guestConnected)} peerOnline={connected && (role === "host" ? room.guestConnected : room.hostConnected)} quiet={quiet} /><h2>{selectedTrack.track}</h2><p>{selectedTrack.artist}</p></div>}
        <div className="tp-room-progress" data-room-revision={room.revision} data-target-position={room.playback.position} data-room-playing={room.playback.playing}><input type="range" aria-label="房间播放进度" min={0} max={total} step={.1} value={position} style={percent(position, total)} disabled={!canControl || !player.duration} onChange={event => { draftRef.current = Number(event.target.value); setDraftPosition(draftRef.current); }} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => { draftRef.current = null; setDraftPosition(null); }} /><div><span>{formatTime(position)}</span><span>{formatTime(total)}</span></div></div>
        {role === "host" ? <div className="tp-room-controls"><button type="button" className="tp-btn tp-btn--primary" disabled={!canControl} onClick={() => roomConnection.command(room.playback.playing ? "pause" : "play")}>{room.playback.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{room.playback.playing ? "暂停两端" : "一起播放"}</button><label className="tp-select"><span className="sr-only">房间曲目</span><select aria-label="房间曲目" value={room.playback.trackId} disabled={!canControl} onChange={event => roomConnection.command("track", { trackId: event.target.value })}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}</select></label></div> : <p className="tp-follow" data-playing={connected && room.playback.playing}>{connected ? room.playback.playing ? "正在跟随对方播放" : "等待对方开始播放" : connection === "closed" ? "本次同频已结束，本机播放已停止" : "连接恢复前已暂停本机播放"}</p>}
        <label className="tp-volume"><Volume2 size={18} aria-hidden="true" /><span>本机音量</span><input type="range" aria-label="本机音量" min={0} max={1} step={.05} value={player.volume} style={percent(player.volume, 1)} onChange={event => player.changeVolume(Number(event.target.value))} /></label>
        {(needsGesture || player.error) && <div className="tp-notice" role="status"><span>{player.error ?? "点击开启声音以跟随房间播放。"}</span><button type="button" className="tp-link" disabled={!connected} onClick={() => void enableAudio()}>{player.error ? "重试音频" : "开启声音"}</button></div>}
        {connection === "error" && <button type="button" className="tp-btn tp-btn--quiet tp-wide" onClick={roomConnection.join}>重新连接</button>}
        <ReactionDock mode="online" disabled={!connected || !room.hostConnected || !room.guestConnected} disabledHint={connection === "closed" ? "本次同频已结束" : !connected ? "连接恢复后再回应" : "等双方在线，再回应这首歌"} outgoing={roomConnection.outgoingReaction} incoming={roomConnection.incomingReaction} onSend={roomConnection.sendReaction} quiet={quiet} onQuietChange={setQuiet} />
        <RoomExchangePanel key={room.exchange?.id ?? "idle"} connection={roomConnection} />
        <div className="tp-room-foot"><button type="button" className="tp-btn tp-btn--quiet" onClick={leave}>{!connected ? "返回附近发现" : "结束同频"}</button><BlockListenerButton target={{ roomId }} alias="这位听众" disabled={!connected} onBlocked={leave} /></div>
      </>}
      {error && <p className="room-error" role="alert">{error}</p>}
      {host.dataError && <p className="room-error" role="alert">{host.dataError}</p>}
      {connection === "closed" && !room && <Link className="tp-btn tp-btn--quiet tp-wide" href="/nearby?mode=online">回到附近发现</Link>}
      <p className="tp-footnote">本次同频最长 2 小时</p>
    </div>
    <MockHostPanel />
  </section><Toaster position="bottom-right" containerAriaLabel="同频通知" closeButton duration={8000} visibleToasts={2} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} /></main>;
}
