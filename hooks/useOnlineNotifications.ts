"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { NearbyInvite } from "@/lib/resonance/nearby-protocol";
import type { RoomRole, RoomSnapshot } from "@/lib/resonance/room-protocol";

export function useIncomingInviteNotification(invite: NearbyInvite | null | undefined, onOpen: () => void) {
  const open = useRef(onOpen);
  useEffect(() => { open.current = onOpen; }, [onOpen]);
  const id = invite?.id, trackId = invite?.trackId;
  useEffect(() => {
    if (!id) return;
    const toastId = `nearby-invite-${id}`;
    const track = audioTracks.find(item => item.id === trackId);
    toast("有人邀请你一起听", { id: toastId, description: track ? `《${track.track}》` : "打开邀请，选择是否加入", duration: Infinity, action: { label: "查看邀请", onClick: () => open.current() } });
    return () => { toast.dismiss(toastId); };
  }, [id, trackId]);
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
    toast(incoming ? "TA 送来一首歌" : "交换完成，收到一首新音乐", {
      id: toastId, description: track ? `《${track.track}》` : "查看这次音乐交换", duration: incoming ? Infinity : 8000,
      action: { label: incoming ? "选歌回应" : "查看回歌", onClick: () => {
        const panel = document.getElementById("room-exchange-panel");
        panel?.scrollIntoView({ block: "start" }); panel?.focus({ preventScroll: true });
      } },
    });
    return () => { toast.dismiss(toastId); };
  }, [roomId, id, role, status, from, offered, response, connected, closed]);
}
