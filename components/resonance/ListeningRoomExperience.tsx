"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Headphones, Link2, Pause, Play, Users, Volume2 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { formatTime } from "@/lib/resonance/library";
import { useListeningRoom } from "@/hooks/useListeningRoom";
import { useResonancePlayer } from "@/hooks/useResonancePlayer";
import { useRoomAudio } from "@/hooks/useRoomAudio";
import { useClientReady } from "@/hooks/useClientReady";
import { AlbumTile } from "./AlbumTile";
import { useHost } from "./HostProvider";
import { HostStatus, MockHostPanel } from "./HostStatus";
import { ReactionDock } from "./ReactionDock";
import { RoomExchangePanel } from "./RoomExchangePanel";
import { Toaster } from "@/components/ui/sonner";
import { useRoomExchangeNotification } from "@/hooks/useOnlineNotifications";
import { AppearanceToggle, MusicAtmosphere } from "./Appearance";

const connectionLabels = { idle: "等待加入", connecting: "正在连接", connected: "已连接", reconnecting: "正在恢复并同步状态", error: "连接未完成", closed: "本次同频已结束" };

export function ListeningRoomExperience({ roomId }: { roomId: string }) {
  const host = useHost();
  if (host.status !== "ready" || !host.session) return <main className="room-page music-room"><MusicAtmosphere /><section className="room-panel"><header className="room-header"><Link href="/nearby">返回附近</Link><AppearanceToggle /></header><HostStatus /><MockHostPanel /></section></main>;
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
  const count = connected ? Number(room?.hostConnected ?? false) + Number(room?.guestConnected ?? false) : 0;
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

  return <main className="room-page music-room" data-audio-status={player.status} data-audio-duration={player.duration} data-audio-track={player.track?.id}><MusicAtmosphere trackId={selectedTrack?.id} /><audio ref={audioRef} preload="auto" hidden /><section className="room-panel">
    <header className="room-header"><button type="button" onClick={leave}><ArrowLeft size={16} aria-hidden="true" />返回附近</button><AppearanceToggle /></header>
    <div className="room-content">
      <div className="room-title"><div><p>LISTEN TOGETHER</p><h1>这一刻，一起听。</h1></div><span className="room-connection" data-connected={connected} role="status">{connectionLabels[connection]}</span></div>
      {room?.exchange?.status === "pending" && role && room.exchange.from !== role && <button type="button" className="integrated-invite-notice" aria-label="查看待回应交换" onClick={() => { const panel = document.getElementById("room-exchange-panel"); panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true }); }}><span role="status">TA 送来一首歌，等你回应</span><span>查看 →</span></button>}
      {!room && <div className="room-join"><Users size={38} aria-hidden="true" /><p>双方已同意，一起听这首歌。<br />分享歌曲的一方带领播放，音量各自调整。</p><button type="button" className="room-primary" disabled={!isClientReady || isBusy || connection === "closed"} onClick={roomConnection.join}><Headphones size={18} aria-hidden="true" />{isBusy ? "正在连接" : "开启声音并加入"}</button></div>}
      {room && <>
        <div className="room-members" aria-label={connected ? `房间人数 ${count} / 2` : "等待连接恢复"}><span data-online={connected && room.hostConnected}><Headphones size={20} aria-hidden="true" /><strong>{role === "host" ? "你 · 分享音乐" : "分享音乐的人"}</strong><small>{connected && room.hostConnected ? "在线" : "未连接"}</small></span><Link2 size={19} aria-hidden="true" /><span data-online={connected && room.guestConnected}><Headphones size={20} aria-hidden="true" /><strong>{role === "guest" ? "你 · 跟听" : "同频的人"}</strong><small>{connected && room.guestConnected ? "在线" : "等待加入"}</small></span></div>
        {selectedTrack && <div className="room-now-playing"><AlbumTile coverUrl={selectedTrack.coverUrl} accent={selectedTrack.accent} size="lg" /><h2>{selectedTrack.track}</h2><p>{selectedTrack.artist}</p></div>}
        <div className="room-progress" data-room-revision={room.revision} data-target-position={room.playback.position} data-room-playing={room.playback.playing}><input type="range" aria-label="房间播放进度" min={0} max={player.duration || selectedTrack?.duration || 0} step={.1} value={draftPosition ?? player.currentTime} disabled={!canControl || !player.duration} onChange={event => { draftRef.current = Number(event.target.value); setDraftPosition(draftRef.current); }} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => { draftRef.current = null; setDraftPosition(null); }} /><div><span>{formatTime(draftPosition ?? player.currentTime)}</span><span>{formatTime(player.duration || selectedTrack?.duration || 0)}</span></div></div>
        {role === "host" ? <div className="room-controls"><button type="button" className="room-primary" disabled={!canControl} onClick={() => roomConnection.command(room.playback.playing ? "pause" : "play")}>{room.playback.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{room.playback.playing ? "暂停两端" : "一起播放"}</button><label><span className="sr-only">房间曲目</span><select aria-label="房间曲目" value={room.playback.trackId} disabled={!canControl} onChange={event => roomConnection.command("track", { trackId: event.target.value })}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}</select></label></div> : <p className="room-follow-status">{connected ? room.playback.playing ? "正在跟随对方播放" : "等待对方开始播放" : connection === "closed" ? "本次同频已结束，本机播放已停止" : "连接恢复前已暂停本机播放"}</p>}
        <label className="room-volume"><Volume2 size={17} aria-hidden="true" /><span>本机音量</span><input type="range" aria-label="本机音量" min={0} max={1} step={.05} value={player.volume} onChange={event => player.changeVolume(Number(event.target.value))} /></label>
        <ReactionDock mode="online" disabled={!connected || !room.hostConnected || !room.guestConnected} disabledHint={connection === "closed" ? "本次同频已结束" : !connected ? "连接恢复后再回应" : "等双方在线，再回应这首歌"} outgoing={roomConnection.outgoingReaction} incoming={roomConnection.incomingReaction} onSend={roomConnection.sendReaction} />
        {(needsGesture || player.error) && <div className="room-audio-notice" role="status"><span>{player.error ?? "点击开启声音以跟随房间播放。"}</span><button type="button" disabled={!connected} onClick={() => void enableAudio()}>{player.error ? "重试音频" : "开启声音"}</button></div>}
        {connection === "error" && <button type="button" className="room-secondary" onClick={roomConnection.join}>重新连接</button>}
        <RoomExchangePanel key={room.exchange?.id ?? "idle"} connection={roomConnection} />
        <button type="button" className="room-leave" onClick={leave}>{!connected ? "返回附近发现" : "结束同频"}</button>
      </>}
      {error && <p className="room-error" role="alert">{error}</p>}
      {host.dataError && <p className="room-error" role="alert">{host.dataError}</p>}
      {connection === "closed" && !room && <Link className="room-secondary" href="/nearby?mode=online">回到附近发现</Link>}
      <p className="room-footnote">本次同频最长 2 小时</p>
    </div>
    <MockHostPanel />
  </section><Toaster position="bottom-right" containerAriaLabel="同频通知" closeButton duration={8000} visibleToasts={2} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} /></main>;
}
