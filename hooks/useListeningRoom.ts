"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "@/components/resonance/HostProvider";
import { catalogVersion } from "@/lib/resonance/catalog";
import type { ExchangeCommand } from "@/lib/resonance/exchange-protocol";
import { REACTION_COOLDOWN_MS, REACTION_TTL_MS, type ReactionDelivery, type ReactionKind, type RoomReaction } from "@/lib/resonance/room-protocol";
import { clockOffset, isRoomSnapshot, UUID_PATTERN, type RoomCommand, type RoomRole, type RoomSnapshot } from "@/lib/resonance/room-protocol";

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "error" | "closed";
const errors: Record<string, string> = {
  INVALID_TOKEN: "本次同频凭据不可用，请返回附近发现重新邀请。",
  AUTH_REQUIRED: "无法验证本次同频。",
  AUTH_TIMEOUT: "连接验证超时，请重试。",
  ROOM_FULL: "这个房间的席位已被占用；掉线席位会保留 90 秒。",
  ROOM_CLOSED: "本次同频已结束或过期。",
  ROOM_NOT_FOUND: "房间不存在或已经结束。",
  REPLACED: "此席位已在另一个连接中恢复。",
  HOST_ONLY: "公共播放由分享音乐的一方控制。",
  STALE_REVISION: "房间状态已更新，请重新操作。",
  RATE_LIMIT: "操作太快，请稍后再试。",
  TRACK_UNAVAILABLE: "歌曲已从歌单移除，请返回附近重新选择。",
};

export function useListeningRoom(roomId: string) {
  const { session } = useHost();
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [exchangeRequest, setExchangeRequest] = useState<"idle" | "sending" | "uncertain">("idle");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const exchangeCommandRef = useRef<ExchangeCommand | null>(null);
  const exchangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [outgoingReaction, setOutgoingReaction] = useState<ReactionDelivery | null>(null);
  const [incomingReaction, setIncomingReaction] = useState<RoomReaction | null>(null);
  const outgoingRef = useRef<ReactionDelivery | null>(null);
  const reactionDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReactionSent = useRef(0);
  const seenReactions = useRef(new Set<string>());
  const roleRef = useRef<RoomRole | null>(null);
  const serverOffsetRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationRef = useRef(0);
  const leavingRef = useRef(false);
  const attemptsRef = useRef(0);
  const lastMessageRef = useRef(0);
  const bestRttRef = useRef(Infinity);
  const credentialsRef = useRef<{ token: string; clientId: string; accountToken?: string } | null>(null);
  const synchronizedRef = useRef(false);
  const resumePingRef = useRef<number | null>(null);
  // Read by audio before React commits a lifecycle update.
  const isSynchronized = useCallback(() => synchronizedRef.current && navigator.onLine && !leavingRef.current && Date.now() - lastMessageRef.current < 12_000, []);

  const settleReaction = useCallback((status: ReactionDelivery["status"], error?: string) => {
    const current = outgoingRef.current;
    if (!current || current.status === "received" || current.status === "failed") return;
    const next = { ...current, status, error };
    outgoingRef.current = next; setOutgoingReaction(next);
    if (status !== "sent" && reactionDeadline.current) { clearTimeout(reactionDeadline.current); reactionDeadline.current = null; }
  }, []);

  const clearReactions = useCallback(() => {
    if (incomingDeadline.current) clearTimeout(incomingDeadline.current);
    incomingDeadline.current = null; setIncomingReaction(null);
    settleReaction("failed", "CONNECTION_LOST");
    if (exchangeTimer.current) clearTimeout(exchangeTimer.current);
    if (exchangeCommandRef.current) { setExchangeRequest("uncertain"); setExchangeError("连接中断，操作结果尚未确认。连接后可重试确认。"); }
  }, [settleReaction]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    timerRef.current = null; heartbeatRef.current = null;
  }, []);

  const connect = useCallback(function openConnection() {
    const credentials = credentialsRef.current;
    if (!credentials || leavingRef.current) return;
    clearTimers();
    synchronizedRef.current = false; resumePingRef.current = null;
    const generation = ++generationRef.current;
    socketRef.current?.close();
    if (!navigator.onLine) { setConnection("reconnecting"); setError("网络已断开，恢复后重新确认播放状态。"); return; }
    setConnection(attemptsRef.current ? "reconnecting" : "connecting");
    const retry = () => {
      if (generation !== generationRef.current || leavingRef.current) return;
      generationRef.current++;
      socketRef.current?.close();
      clearTimers();
      synchronizedRef.current = false;
      clearReactions();
      if (attemptsRef.current >= 8) { setConnection("error"); setError("暂时无法连接房间，请检查网络后重试。"); return; }
      const delay = Math.min(750 * 2 ** attemptsRef.current++, 8000);
      setConnection("reconnecting");
      timerRef.current = setTimeout(openConnection, delay);
    };
    void (async () => {
      try {
        const probe = new AbortController();
        const deadline = setTimeout(() => probe.abort(), 8000);
        let available: Response;
        try { available = await fetch(`/api/rooms/${roomId}/status`, { cache: "no-store", signal: probe.signal }); }
        finally { clearTimeout(deadline); }
        if (generation !== generationRef.current || leavingRef.current) return;
        if (available.status === 404) { leavingRef.current = true; clearReactions(); exchangeCommandRef.current = null; setExchangeRequest("idle"); setExchangeError(null); setConnection("closed"); setError(errors.ROOM_NOT_FOUND); return; }
        if (!available.ok) { retry(); return; }
        const url = new URL(`/api/rooms/${roomId}/socket`, window.location.origin);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(url);
        socketRef.current = socket;
        lastMessageRef.current = Date.now();
        timerRef.current = setTimeout(() => { socket.close(); retry(); }, 8000);
        socket.onopen = () => {
          if (generation !== generationRef.current || leavingRef.current) { socket.close(); return; }
          // Keep the deadline until authenticated welcome, not merely TCP open.
          socket.send(JSON.stringify({ type: "hello", ...credentials }));
          heartbeatRef.current = setInterval(() => {
            if (Date.now() - lastMessageRef.current > 20_000) { socket.close(); return; }
            if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping", sentAt: Date.now() }));
          }, 4000);
        };
        socket.onmessage = event => {
          if (generation !== generationRef.current || leavingRef.current) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === "exchange-result" && message.requestId === exchangeCommandRef.current?.id) {
            if (exchangeTimer.current) clearTimeout(exchangeTimer.current);
            exchangeTimer.current = null; exchangeCommandRef.current = null; setExchangeRequest("idle");
            const reasons: Record<string, string> = { EXCHANGE_BUSY: "对方已经发起交换，请先处理当前这份。", EXCHANGE_STALE: "这次操作已过期，请重新选择操作。", EXCHANGE_FINISHED: "这份交换已结束或到期。", EXCHANGE_FORBIDDEN: "只有接收方能回应，发起方可以撤回。", EXCHANGE_INVALID_REPLY: "请选择与收到的歌不同的一首。", EXCHANGE_CONFLICT: "操作编号冲突，请重新操作。", EXCHANGE_LIMIT: "还有交换结果等待保存，或本次会话已达到交换上限。", PEER_OFFLINE: "对方暂时离线，恢复连接后再送出。", EXCHANGE_ACCOUNT_REQUIRED: "请通过附近邀请进入有账号授权的同频。", INVALID_TRACK: "这首歌暂不可交换。", RATE_LIMIT: "操作太快，请稍后再试。" };
            setExchangeError(message.error ? reasons[message.error] ?? "交换操作未完成，请重试。" : null);
          }
          if (message.type === "reaction-status" && message.id === outgoingRef.current?.id && ["sent", "received", "failed"].includes(message.status)) {
            settleReaction(message.status, typeof message.error === "string" ? message.error : undefined); return;
          }
          if (message.type === "reaction") {
            if (!isSynchronized()) return;
            const item = message.event as RoomReaction | undefined;
            if (!roleRef.current || !item || !UUID_PATTERN.test(item.id ?? "") || !["wave", "heart"].includes(item.kind) || !["host", "guest"].includes(item.from) || item.from === roleRef.current || !Number.isFinite(item.createdAt) || typeof item.trackId !== "string" || !Number.isFinite(message.serverTime) || message.serverTime - item.createdAt > REACTION_TTL_MS || message.serverTime < item.createdAt) return;
            if (Date.now() + serverOffsetRef.current - item.createdAt > REACTION_TTL_MS) return;
            if (!seenReactions.current.has(item.id)) {
              seenReactions.current.add(item.id);
              if (seenReactions.current.size > 64) seenReactions.current.delete(seenReactions.current.values().next().value!);
              setIncomingReaction(item);
              if (incomingDeadline.current) clearTimeout(incomingDeadline.current);
              incomingDeadline.current = setTimeout(() => setIncomingReaction(null), 4500);
            }
            socket.send(JSON.stringify({ type: "reaction-received", id: item.id })); return;
          }
          if (message.type === "error") { setError(errors[message.error] ?? "房间操作未完成，请重试。"); return; }
          if (!["welcome", "state", "exchange-result"].includes(message.type) || !isRoomSnapshot(message.room) || message.room.id !== roomId || !Number.isFinite(message.serverTime)) return;
          if (message.room.catalogVersion && message.room.catalogVersion !== catalogVersion) {
            leavingRef.current = true; clearTimers(); clearReactions(); socket.close(); setConnection("error"); setError("歌单已更新，请刷新页面后重新进入同频。"); return;
          }
          if (snapshotRef.current && message.room.revision < snapshotRef.current.revision) return;
          lastMessageRef.current = Date.now();
          if (message.type === "welcome") {
            if (message.role !== "host" && message.role !== "guest") return;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = null; synchronizedRef.current = true;
            setRole(message.role); attemptsRef.current = 0; bestRttRef.current = Infinity;
            roleRef.current = message.role;
            setOffset(message.serverTime - Date.now());
            serverOffsetRef.current = message.serverTime - Date.now();
            setError(null); setConnection("connected");
            socket.send(JSON.stringify({ type: "ping", sentAt: Date.now() }));
          }
          if (resumePingRef.current !== null && message.sentAt === resumePingRef.current) {
            resumePingRef.current = null; synchronizedRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = null; setConnection("connected"); setError(null);
          }
          if (Number.isFinite(message.sentAt)) {
            const receivedAt = Date.now();
            const rtt = receivedAt - message.sentAt;
            if (rtt >= 0 && rtt < 1500 && rtt <= bestRttRef.current + 30) {
              bestRttRef.current = Math.min(bestRttRef.current, rtt);
              setOffset(clockOffset(message.sentAt, receivedAt, message.serverTime));
              serverOffsetRef.current = clockOffset(message.sentAt, receivedAt, message.serverTime);
            }
          }
          snapshotRef.current = message.room;
          setRoom(message.room);
          if (message.room.closed) { leavingRef.current = true; clearTimers(); clearReactions(); exchangeCommandRef.current = null; setExchangeRequest("idle"); setExchangeError(null); setConnection("closed"); setError(errors.ROOM_CLOSED); }
        };
        socket.onerror = () => { /* onclose performs bounded reconnect. */ };
        socket.onclose = event => {
          if (generation !== generationRef.current || leavingRef.current) return;
          clearTimers();
          synchronizedRef.current = false;
          clearReactions();
          if ([4001, 4003, 4004, 4005].includes(event.code)) {
            leavingRef.current = true;
            setConnection(event.code === 4004 ? "closed" : "error");
            setError(errors[event.reason] ?? "无法加入同频，请返回附近发现重新邀请。");
            return;
          }
          retry();
        };
      } catch { retry(); }
    })();
  }, [roomId, clearTimers, clearReactions, settleReaction, isSynchronized]);

  useEffect(() => {
    const offline = () => {
      if (!credentialsRef.current || leavingRef.current) return;
      synchronizedRef.current = false; generationRef.current++;
      clearTimers(); clearReactions(); socketRef.current?.close();
      setConnection("reconnecting"); setError("网络已断开，恢复后重新确认播放状态。");
    };
    const resume = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine || !credentialsRef.current || leavingRef.current) return;
      synchronizedRef.current = false;
      if (socketRef.current?.readyState !== WebSocket.OPEN || Date.now() - lastMessageRef.current >= 12_000) {
        attemptsRef.current = 0; clearReactions(); connect(); return;
      }
      // Only this ping's response may release audio; older queued states cannot.
      const sentAt = Date.now(); resumePingRef.current = sentAt;
      bestRttRef.current = Infinity; setConnection("reconnecting");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(connect, 8000);
      socketRef.current.send(JSON.stringify({ type: "ping", sentAt }));
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [clearTimers, clearReactions, connect]);

  const join = useCallback(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    let token = fragment.get("host") ?? fragment.get("invite");
    try { token = session ? sessionStorage.getItem(`resonance.nearby-room.${session.accountId}.${roomId}`) ?? token : token; } catch { /* Legacy local test links remain usable. */ }
    if (!UUID_PATTERN.test(roomId) || !token || !UUID_PATTERN.test(token)) { setConnection("error"); setError(errors.INVALID_TOKEN); return; }
    let clientId: string = crypto.randomUUID();
    try {
      const key = `resonance.room-client.${roomId}`;
      const stored = sessionStorage.getItem(key);
      if (stored && UUID_PATTERN.test(stored)) clientId = stored;
      else sessionStorage.setItem(key, clientId);
    } catch { /* Current connection still works without reload persistence. */ }
    credentialsRef.current = { token, clientId, accountToken: session?.token };
    leavingRef.current = false; attemptsRef.current = 0; setError(null);
    connect();
  }, [connect, roomId, session]);

  const command = useCallback((action: RoomCommand["action"], values: { position?: number; trackId?: string } = {}) => {
    if (!isSynchronized()) return;
    const socket = socketRef.current;
    const current = snapshotRef.current;
    if (socket?.readyState !== WebSocket.OPEN || !current || current.closed) return;
    setError(null);
    socket.send(JSON.stringify({ type: "command", id: crypto.randomUUID(), revision: current.revision, action, ...values }));
  }, [isSynchronized]);
  const leave = useCallback(() => {
    leavingRef.current = true; clearTimers(); clearReactions();
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "leave" }));
    socketRef.current?.close(1000, "LEFT_ROOM");
    setConnection("closed");
  }, [clearTimers, clearReactions]);
  const disconnect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "leave" }));
    leavingRef.current = true; generationRef.current++; clearTimers(); clearReactions(); socketRef.current?.close();
  }, [clearTimers, clearReactions]);
  useEffect(() => disconnect, [disconnect]);

  const sendReaction = useCallback((kind: ReactionKind) => {
    if (!isSynchronized()) return;
    const socket = socketRef.current, current = snapshotRef.current;
    if (socket?.readyState !== WebSocket.OPEN || !current?.hostConnected || !current.guestConnected || current.closed || Date.now() - lastReactionSent.current < REACTION_COOLDOWN_MS || ["sending", "sent"].includes(outgoingRef.current?.status ?? "")) return;
    const delivery: ReactionDelivery = { id: crypto.randomUUID(), kind, status: "sending" };
    outgoingRef.current = delivery; setOutgoingReaction(delivery); lastReactionSent.current = Date.now();
    reactionDeadline.current = setTimeout(() => settleReaction("failed", "DELIVERY_UNCONFIRMED"), REACTION_TTL_MS);
    socket.send(JSON.stringify({ type: "reaction", id: delivery.id, kind, trackId: current.playback.trackId, sentAt: Date.now() + offset }));
  }, [offset, settleReaction, isSynchronized]);

  const transmitExchange = useCallback((command: ExchangeCommand) => {
    if (!isSynchronized()) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN || snapshotRef.current?.closed) return;
    exchangeCommandRef.current = command; setExchangeRequest("sending"); setExchangeError(null);
    if (exchangeTimer.current) clearTimeout(exchangeTimer.current);
    exchangeTimer.current = setTimeout(() => { setExchangeRequest("uncertain"); setExchangeError("暂未确认操作结果，请重试确认；不会重复送出。"); }, 8000);
    socketRef.current.send(JSON.stringify(command));
  }, [isSynchronized]);
  const sendExchange = useCallback((action: ExchangeCommand["action"], values: { exchangeId?: string; trackId?: string } = {}) => {
    if (exchangeCommandRef.current) return;
    transmitExchange({ type: "exchange", id: crypto.randomUUID(), action, sentAt: Date.now() + serverOffsetRef.current, ...values });
  }, [transmitExchange]);
  const retryExchange = useCallback(() => { if (exchangeCommandRef.current) transmitExchange(exchangeCommandRef.current); }, [transmitExchange]);

  return { connection, room, role, error, offset, join, command, leave, outgoingReaction, incomingReaction, sendReaction, exchangeRequest, exchangeError, sendExchange, retryExchange, isSynchronized };
}
