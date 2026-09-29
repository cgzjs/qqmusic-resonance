"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Pause, Play, Volume2 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { formatTime } from "@/lib/resonance/library";
import { useListeningRoom } from "@/hooks/useListeningRoom";
import { useRoomAudio } from "@/hooks/useRoomAudio";
import { useRoomExchangeNotification } from "@/hooks/useOnlineNotifications";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";
import { ListeningArtwork } from "./ListeningArtwork";
import { useHost } from "./HostProvider";
import { ReactionDock } from "./ReactionDock";
import { RoomExchangePanel } from "./RoomExchangePanel";
import { BlockListenerButton } from "./ListenerSafety";

const connectionLabels = { idle: "正在连接", connecting: "正在连接", connected: "已连接", reconnecting: "正在重新连接", error: "没连上", closed: "一起听已结束" };
const percent = (value: number, max: number) => ({ "--p": `${max ? Math.min(100, value / max * 100) : 0}%` }) as CSSProperties;

type Props = {
  roomId: string;
  player: ResonancePlayer;
  onExit: () => void;
  onTrack?: (trackId: string) => void;
  variant: "page" | "inline";
  headerExtra?: ReactNode;
};

// 一起听本体：页面版（刷新/重连）和附近页原地版共用。进入即连接，不再多一屏确认。
export function RoomSession({ roomId, player, onExit, onTrack, variant, headerExtra }: Props) {
  const host = useHost();
  const saveHistory = host.save;
  const roomConnection = useListeningRoom(roomId);
  const { room, role, connection, error, join } = roomConnection;
  const { needsGesture, enableAudio } = useRoomAudio(room, connection, roomConnection.offset, player, roomConnection.isSynchronized);
  const [draftPosition, setDraftPosition] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const selectedTrack = audioTracks.find(track => track.id === room?.playback.trackId);
  const connected = connection === "connected" && !room?.closed;
  useRoomExchangeNotification(room, role, connected);
  const canControl = connected && role === "host";
  const [quiet, setQuiet] = useState(false);
  const recorded = useRef(new Set<string>());
  // StrictMode 下卸载会断开连接，重新挂载时要能再次加入，所以不做“只加入一次”的保护。
  useEffect(() => { join(); }, [join]);
  // 被人跟听时，新房间从 0 秒暂停开始；房主接着刚才的进度继续放，TA 跟上。
  const [resumeFrom] = useState(() => ({ trackId: player.track?.id, position: player.currentTime, playing: player.wantsPlayback }));
  const resumeStep = useRef<"idle" | "seeking" | "done">("idle");
  const { command } = roomConnection;
  useEffect(() => {
    if (resumeStep.current === "done" || !room || !connected || !role) return;
    if (role === "host" && room.revision === 0 && resumeFrom.trackId === room.playback.trackId && resumeFrom.position > 1) {
      if (resumeStep.current === "idle") { resumeStep.current = "seeking"; command("seek", { position: resumeFrom.position }); }
      return;
    }
    resumeStep.current = "done";
    if (role === "host" && resumeFrom.playing && !room.playback.playing) command("play");
  }, [room, connected, role, command, resumeFrom]);
  const trackId = room?.playback.trackId;
  useEffect(() => { if (trackId) onTrack?.(trackId); }, [trackId, onTrack]);
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
    roomConnection.leave(); player.stop(); onExit();
  }

  const total = player.duration || selectedTrack?.duration || 0;
  const position = draftPosition ?? player.currentTime;

  return <div className="tp-room tp-room-session" data-variant={variant} data-audio-status={player.status}>
    <header className={variant === "page" ? "tp-top tp-room-top" : "tp-room-top tp-room-head"}><button type="button" className="tp-icon-btn" aria-label="返回附近" onClick={leave}><ArrowLeft size={20} aria-hidden="true" /></button><div className="tp-room-title"><h1>一起听</h1><span className="tp-room-status" data-connected={connected} role="status">{connectionLabels[connection]}</span></div>{headerExtra}</header>
    <div className="tp-room-body">
      {room?.exchange?.status === "pending" && role && room.exchange.from !== role && <button type="button" className="integrated-invite-notice" aria-label="查看待回应交换" onClick={() => { const panel = document.getElementById("room-exchange-panel"); panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true }); }}><span role="status">TA 送来一首歌，等你回应</span><span>查看</span></button>}
      {!room && connection !== "closed" && connection !== "error" && <p className="tp-follow" role="status">正在进入一起听…</p>}
      {room && <>
        {selectedTrack && <div className="tp-now"><ListeningArtwork key={selectedTrack.id} track={selectedTrack} mode="online" role={role} outgoing={roomConnection.outgoingReaction} incoming={roomConnection.incomingReaction} selfOnline={connected && (role === "host" ? room.hostConnected : room.guestConnected)} peerOnline={connected && (role === "host" ? room.guestConnected : room.hostConnected)} quiet={quiet} /><h2>{selectedTrack.track}</h2><p>{selectedTrack.artist}</p></div>}
        <div className="tp-room-progress" data-room-revision={room.revision} data-target-position={room.playback.position} data-room-playing={room.playback.playing}><input type="range" aria-label="房间播放进度" min={0} max={total} step={.1} value={position} style={percent(position, total)} disabled={!canControl || !player.duration} onChange={event => { draftRef.current = Number(event.target.value); setDraftPosition(draftRef.current); }} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => { draftRef.current = null; setDraftPosition(null); }} /><div><span>{formatTime(position)}</span><span>{formatTime(total)}</span></div></div>
        {role === "host" ? <div className="tp-room-controls"><button type="button" className="tp-btn tp-btn--primary" disabled={!canControl} onClick={() => roomConnection.command(room.playback.playing ? "pause" : "play")}>{room.playback.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{room.playback.playing ? "一起暂停" : "一起播放"}</button><label className="tp-select"><span className="sr-only">歌曲</span><select aria-label="房间曲目" value={room.playback.trackId} disabled={!canControl} onChange={event => roomConnection.command("track", { trackId: event.target.value })}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}</select></label></div> : <p className="tp-follow" data-playing={connected && room.playback.playing}>{connected ? room.playback.playing ? "正在和 TA 同步播放" : "等 TA 开始播放" : connection === "closed" ? "播放已停止" : "连接断开，已暂停"}</p>}
        <label className="tp-volume"><Volume2 size={18} aria-hidden="true" /><span>我的音量</span><input type="range" aria-label="我的音量" min={0} max={1} step={.05} value={player.volume} style={percent(player.volume, 1)} onChange={event => player.changeVolume(Number(event.target.value))} /></label>
        {(needsGesture || player.error) && <div className="tp-notice" role="status"><span>{player.error ?? "打开声音，跟上 TA 的播放"}</span><button type="button" className="tp-link" disabled={!connected} onClick={() => void enableAudio()}>{player.error ? "重试播放" : "打开声音"}</button></div>}
        <ReactionDock mode="online" disabled={!connected || !room.hostConnected || !room.guestConnected} disabledHint={connection === "closed" ? "一起听已结束" : !connected ? "连接恢复后再回应" : "等双方在线，再回应这首歌"} outgoing={roomConnection.outgoingReaction} incoming={roomConnection.incomingReaction} onSend={roomConnection.sendReaction} quiet={quiet} onQuietChange={setQuiet} />
        <RoomExchangePanel key={room.exchange?.id ?? "idle"} connection={roomConnection} />
        <div className="tp-room-foot"><button type="button" className="tp-btn tp-btn--quiet" onClick={leave}>{!connected ? "回到附近" : "结束一起听"}</button><BlockListenerButton target={{ roomId }} alias="这位听众" disabled={!connected} onBlocked={leave} /></div>
      </>}
      {connection === "error" && <button type="button" className="tp-btn tp-btn--quiet tp-wide" onClick={join}>重新连接</button>}
      {error && <p className="room-error" role="alert">{error}</p>}
      {variant === "page" && host.dataError && <p className="room-error" role="alert">{host.dataError}</p>}
      {!room && (connection === "closed" || connection === "error") && <button type="button" className="tp-btn tp-btn--quiet tp-wide" onClick={leave}>回到附近</button>}
      <p className="tp-footnote">每次一起听最长 2 小时</p>
    </div>
  </div>;
}
