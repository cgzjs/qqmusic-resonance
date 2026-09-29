"use client";

import { useEffect, useRef, useState } from "react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { NearbyPeer } from "@/lib/resonance/nearby-protocol";
import type { ReactionDelivery, ReactionKind } from "@/lib/resonance/room-protocol";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";
import { useHost } from "./HostProvider";
import { GiftPanel, type GiftState } from "./RoomExchangePanel";
import { RoomStage } from "./RoomStage";

type Props = {
  peer: NearbyPeer;
  player: ResonancePlayer;
  onExit: () => void;
  onTrack?: (trackId: string) => void;
  reaction: ReactionDelivery | null;
  onReact: (kind: ReactionKind, trackId: string) => void;
  /** 把送出的歌记进足迹，返回记录 id；失败返回 null。 */
  onGift: (trackId: string) => Promise<string | null>;
};

// 和模拟听众一起听：界面与真实房间相同。你是跟听的一方，TA 放完一首会接着放下一首。
export function DemoRoomSession({ peer, player, onExit, onTrack, reaction, onReact, onGift }: Props) {
  const saveHistory = useHost().save;
  // TA 在放的歌就是播放器里的歌；还没开始时按 TA 在附近页显示的那首。
  const trackId = audioTracks.some(item => item.id === player.track?.id) ? player.track!.id : peer.trackId;
  const track = audioTracks.find(item => item.id === trackId);
  const [gift, setGift] = useState<GiftState | null>(null);
  const [request, setRequest] = useState<"idle" | "sending">("idle");
  const [giftError, setGiftError] = useState<string | null>(null);
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    if (player.status !== "ended" || !audioTracks.length) return;
    const next = audioTracks[(audioTracks.findIndex(item => item.id === trackId) + 1) % audioTracks.length];
    if (!next.available) return;
    onTrack?.(next.id);
    void player.playTrack(next);
  }, [player, trackId, onTrack]);
  useEffect(() => {
    if (player.status !== "playing" || !track || player.track?.id !== track.id || recorded.current.has(track.id)) return;
    recorded.current.add(track.id);
    void saveHistory("listen", track.id, crypto.randomUUID());
  }, [player.status, player.track, track, saveHistory]);

  async function send(id: string) {
    setRequest("sending"); setGiftError(null);
    const recordId = await onGift(id);
    setRequest("idle");
    if (recordId) setGift({ id: recordId, trackId: id, mine: true, savedForSelf: true });
    else setGiftError("没送出去，请重试");
  }
  function leave() { player.stop(); onExit(); }

  const playing = player.status === "playing" && player.track?.id === trackId;
  const stalled = !!player.error || (!player.wantsPlayback && player.status !== "ended");
  return <RoomStage variant="inline" status="已连接" connected player={player} onLeave={leave}
    body={{
      mode: "demo", track, role: "guest", selfOnline: true, peerOnline: true,
      outgoing: reaction?.trackId === trackId ? reaction : null, incoming: null,
      seekable: false, onSeek: () => {},
      follow: { playing, text: playing ? "正在和 TA 同步播放" : "等 TA 开始播放" },
      notice: stalled && track && <div className="tp-notice" role="status"><span>{player.error ?? "打开声音，跟上 TA 的播放"}</span><button type="button" className="tp-link" onClick={() => void player.playTrack(track)}>{player.error ? "重试播放" : "打开声音"}</button></div>,
      reaction: { disabled: !track, disabledHint: "等 TA 开始播放", onSend: kind => onReact(kind, trackId) },
      gift: <GiftPanel key={gift?.id ?? "idle"} gift={gift} defaultTrackId={trackId} connected bothOnline request={request} error={giftError} onSend={id => void send(id)} />,
      leaveLabel: "结束一起听",
    }} />;
}
