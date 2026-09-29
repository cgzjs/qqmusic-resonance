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

// TA 送来一首时提醒一次；自己送出的由面板显示“已送给 TA”。
export function useRoomExchangeNotification(room: RoomSnapshot | null, role: RoomRole | null, connected: boolean) {
  const gift = room?.exchange;
  const seen = useRef(new Set<string>());
  const roomId = room?.id, closed = room?.closed;
  const id = gift?.id, from = gift?.from, trackId = gift?.offeredTrackId;
  useEffect(() => {
    if (!roomId || !id || !role || !connected || closed || from === role) return;
    const key = `${roomId}:${id}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    const toastId = `room-gift-${key}`;
    const track = audioTracks.find(item => item.id === trackId);
    toast("TA 送你一首歌", {
      id: toastId, description: track ? `《${track.track}》` : undefined, duration: 6000,
      action: { label: "看看", onClick: () => {
        const panel = document.getElementById("room-exchange-panel");
        panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true });
      } },
    });
  }, [roomId, id, role, from, trackId, connected, closed]);
}
