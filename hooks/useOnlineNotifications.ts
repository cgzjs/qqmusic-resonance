"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { SessionTicket } from "@/lib/resonance/nearby-protocol";
import type { RoomRole, RoomSnapshot } from "@/lib/resonance/room-protocol";

// 免邀请：有人跟你一起听时只提醒一次，不需要你处理。
export function useFollowerNotification(ticket: SessionTicket | null) {
  const roomId = ticket?.role === "host" ? ticket.roomId : null, alias = ticket?.peerAlias;
  useEffect(() => {
    if (roomId) toast(`${alias} 在跟你一起听`, { id: `nearby-follower-${roomId}`, description: "你放什么，TA 就听什么", duration: 6000 });
  }, [roomId, alias]);
}

export function useRoomExchangeNotification(room: RoomSnapshot | null, role: RoomRole | null, connected: boolean) {
  const exchange = room?.exchange;
  const seen = useRef(new Set<string>());
  const roomId = room?.id, closed = room?.closed;
  const id = exchange?.id, status = exchange?.status, from = exchange?.from;
  const offered = exchange?.offeredTrackId, response = exchange?.responseTrackId;
  useEffect(() => {
    if (!roomId || !id || !role || !connected || closed) return;
    const incoming = status === "pending" && from !== role;
    if (!incoming && status !== "completed") return;
    const key = `${roomId}:${id}:${status}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    const toastId = `room-exchange-${key}`;
    const trackId = incoming || from !== role ? offered : response;
    const track = audioTracks.find(item => item.id === trackId);
    toast(incoming ? "TA 送来一首歌" : "交换成功，收到一首新歌", {
      id: toastId, description: track ? `《${track.track}》` : "查看这次音乐交换", duration: incoming ? Infinity : 8000,
      action: { label: incoming ? "回一首" : "查看回歌", onClick: () => {
        const panel = document.getElementById("room-exchange-panel");
        panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true });
      } },
    });
    return () => { toast.dismiss(toastId); };
  }, [roomId, id, role, status, from, offered, response, connected, closed]);
}
