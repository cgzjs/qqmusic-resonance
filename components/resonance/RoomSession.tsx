"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useListeningRoom } from "@/hooks/useListeningRoom";
import { useRoomAudio } from "@/hooks/useRoomAudio";
import { useRoomExchangeNotification } from "@/hooks/useOnlineNotifications";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";
import { useHost } from "./HostProvider";
import { RoomStage } from "./RoomStage";
import { RoomExchangePanel } from "./RoomExchangePanel";
import { BlockListenerButton } from "./ListenerSafety";

const connectionLabels = { idle: "正在连接", connecting: "正在连接", connected: "已连接", reconnecting: "正在重新连接", error: "没连上", closed: "一起听已结束" };

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
  const selectedTrack = audioTracks.find(track => track.id === room?.playback.trackId);
  const connected = connection === "connected" && !room?.closed;
  useRoomExchangeNotification(room, role, connected);
  const canControl = connected && role === "host";
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

  function leave() {
    roomConnection.leave(); player.stop(); onExit();
  }

  const peerOnline = connected && !!room && (role === "host" ? room.guestConnected : room.hostConnected);
  return <RoomStage variant={variant} headerExtra={headerExtra} status={connectionLabels[connection]} connected={connected} player={player} onLeave={leave}
    before={!room && connection !== "closed" && connection !== "error" && <p className="tp-follow" role="status">正在进入一起听…</p>}
    body={room ? {
      mode: "online", track: selectedTrack, role, peerOnline,
      selfOnline: connected && (role === "host" ? room.hostConnected : room.guestConnected),
      outgoing: roomConnection.outgoingReaction, incoming: roomConnection.incomingReaction,
      seekable: canControl, onSeek: position => command("seek", { position }),
      progressData: { "data-room-revision": room.revision, "data-target-position": room.playback.position, "data-room-playing": room.playback.playing },
      host: role === "host" ? { playing: room.playback.playing, disabled: !canControl, trackId: room.playback.trackId, onToggle: () => command(room.playback.playing ? "pause" : "play"), onTrack: trackId => command("track", { trackId }) } : undefined,
      follow: { playing: connected && room.playback.playing, text: connected ? room.playback.playing ? "正在和 TA 同步播放" : "等 TA 开始播放" : connection === "closed" ? "播放已停止" : "连接断开，已暂停" },
      notice: (needsGesture || player.error) && <div className="tp-notice" role="status"><span>{player.error ?? "打开声音，跟上 TA 的播放"}</span><button type="button" className="tp-link" disabled={!connected} onClick={() => void enableAudio()}>{player.error ? "重试播放" : "打开声音"}</button></div>,
      reaction: { disabled: !connected || !room.hostConnected || !room.guestConnected, disabledHint: connection === "closed" ? "一起听已结束" : !connected ? "连接恢复后再回应" : "等双方在线，再回应这首歌", onSend: roomConnection.sendReaction },
      gift: <RoomExchangePanel key={room.exchange?.id ?? "idle"} connection={roomConnection} />,
      leaveLabel: !connected ? "回到附近" : "结束一起听",
      safety: <BlockListenerButton target={{ roomId }} alias="这位听众" disabled={!connected} onBlocked={leave} />,
    } : null}
    after={<>
      {connection === "error" && <button type="button" className="tp-btn tp-btn--quiet tp-wide" onClick={join}>重新连接</button>}
      {error && <p className="room-error" role="alert">{error}</p>}
      {variant === "page" && host.dataError && <p className="room-error" role="alert">{host.dataError}</p>}
      {!room && (connection === "closed" || connection === "error") && <button type="button" className="tp-btn tp-btn--quiet tp-wide" onClick={leave}>回到附近</button>}
    </>} />;
}
