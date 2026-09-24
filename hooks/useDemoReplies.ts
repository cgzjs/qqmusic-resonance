"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "@/components/resonance/HostProvider";
import type { DemoReply } from "@/lib/resonance/demo-reply";
import type { ReactionDelivery, ReactionKind } from "@/lib/resonance/room-protocol";

export function useDemoReplies(onReply: (reply: DemoReply) => void) {
  const { data, save, claimReply } = useHost();
  const [sending, setSending] = useState<(ReactionDelivery & { trackId: string }) | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const claiming = useRef(new Set<string>());
  const notify = useRef(onReply);
  useEffect(() => { notify.current = onReply; }, [onReply]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    for (const item of data.demoReplies ?? []) {
      if (item.status !== "ready" || item.notified || claiming.current.has(item.id)) continue;
      claiming.current.add(item.id);
      void claimReply(item.id).then(reply => { if (mounted.current && reply) notify.current(reply); }).finally(() => claiming.current.delete(item.id));
    }
  }, [data.demoReplies, claimReply]);
  const latest = (data.demoReplies ?? []).filter(item => item.kind !== "exchange").at(-1);
  const reaction: ReactionDelivery | null = latest && (!sending || latest.id === sending.id) ? {
    id: latest.id, kind: latest.kind as ReactionKind, trackId: latest.trackId, status: latest.status === "pending" ? "sent" : "received",
  } : sending;
  const sendReaction = useCallback(async (kind: ReactionKind, trackId: string) => {
    if (busy.current || (data.demoReplies ?? []).some(item => item.kind !== "exchange" && item.status === "pending")) return;
    busy.current = true;
    const id = sending?.status === "failed" && sending.kind === kind && sending.trackId === trackId ? sending.id : crypto.randomUUID();
    setSending({ id, kind, trackId, status: "sending" });
    const ok = await save(kind === "wave" ? "queueWave" : "queueHeart", trackId, id);
    busy.current = false;
    if (mounted.current) setSending(ok ? null : { id, kind, trackId, status: "failed", error: "DELIVERY_UNCONFIRMED" });
  }, [data.demoReplies, save, sending]);
  return { reaction, sendReaction };
}
