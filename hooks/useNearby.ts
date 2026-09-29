"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { NearbySnapshot, SessionTicket } from "@/lib/resonance/nearby-protocol";
import { accountHeaders, type HostSession } from "@/lib/resonance/host-protocol";
import { demoHost } from "@/lib/resonance/demo-host";

const messages: Record<string, string> = {
  AUTH_EXPIRED: "登录已过期，请重新登录。", ALREADY_DISCOVERING: "已在另一个页面打开，请先关掉那边",
  SESSION_EXPIRED: "连接超时，已自动隐身", UNAVAILABLE: "TA 已离开",
  BUSY: "TA 正在和别人一起听", COOLDOWN: "太快啦，稍等再试",
  AREA_FULL: "附近人太多，稍后再试", CONNECT_FAILED: "没连上，请重试",
};

const subscribeNetwork = (notify: () => void) => {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};
const readOnline = () => navigator.onLine;
const serverOnline = () => true;

const readActiveRoom = (accountId: string) => {
  try {
    const roomId = sessionStorage.getItem(`resonance.nearby-room.${accountId}.active`);
    return roomId && sessionStorage.getItem(`resonance.nearby-room.${accountId}.${roomId}`) ? roomId : null;
  } catch { return null; }
};

export function useNearby(session: HostSession) {
  // 一起听在附近页原地进行；刷新后从会话存储恢复同一个房间。
  const [room, setRoom] = useState<string | null>(() => readActiveRoom(session.accountId));
  // 本次跟听的凭据（刷新恢复时没有，只用于提醒被跟的一方）。
  const [joined, setJoined] = useState<SessionTicket | null>(null);
  const [snapshot, setSnapshot] = useState<NearbySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const online = useSyncExternalStore(subscribeNetwork, readOnline, serverOnline);
  const [now, setNow] = useState(0);
  const confirmedAt = useRef(0);
  const serverOffset = useRef(0);
  const readyRef = useRef(false);
  const epoch = useRef(0);
  const queued = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const enteringRef = useRef(room !== null);

  // 邀请人直接进入等待；房主仅在主动接受后进入。
  const enterSession = useCallback((next: NearbySnapshot, accepted = false) => {
    if (!next.ticket || enteringRef.current || (next.ticket.role === "host" && !accepted)) return false;
    const prefix = `resonance.nearby-room.${session.accountId}.`;
    try {
      sessionStorage.setItem(prefix + next.ticket.roomId, next.ticket.token);
      sessionStorage.setItem(`${prefix}active`, next.ticket.roomId);
    } catch { setError("请允许浏览器保存网站数据"); return false; }
    enteringRef.current = true;
    const token = tokenRef.current;
    epoch.current++; tokenRef.current = null; readyRef.current = false;
    if (token) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${token}` }, body: "{}", keepalive: true }).catch(() => {});
    setSnapshot(null); setReady(false); setError(null); setJoined(next.ticket); setRoom(next.ticket.roomId);
    return true;
  }, [session]);

  const leaveSession = useCallback(() => {
    const prefix = `resonance.nearby-room.${session.accountId}.`;
    try {
      const active = sessionStorage.getItem(`${prefix}active`);
      if (active) sessionStorage.removeItem(prefix + active);
      sessionStorage.removeItem(`${prefix}active`);
    } catch { /* 内存状态照样退出。 */ }
    enteringRef.current = false; setJoined(null); setRoom(null);
  }, [session.accountId]);

  const request = useCallback(async function perform(action: string, body?: object) {
    if (action === "stop") {
      const token = tokenRef.current;
      epoch.current++; tokenRef.current = null; readyRef.current = false;
      setSnapshot(null); setReady(false);
      setError(navigator.onLine ? null : "已隐身，约半分钟后完全生效");
      if (token) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${token}` }, body: "{}", keepalive: true }).catch(() => {
        if (mountedRef.current && !tokenRef.current) setError("已隐身，约半分钟后完全生效");
      });
      return;
    }
    if (!navigator.onLine || enteringRef.current) return;
    if (pendingRef.current && (action === "state" || queued.current)) return;
    const startedEpoch = epoch.current;
    // Keep at most one click behind a heartbeat; never replay it after a lifecycle change.
    if (pendingRef.current) {
      queued.current = true;
      try { while (pendingRef.current && mountedRef.current && startedEpoch === epoch.current) await new Promise(resolve => setTimeout(resolve, 50)); }
      finally { queued.current = false; }
    }
    if (!mountedRef.current || startedEpoch !== epoch.current || !navigator.onLine) return;
    if (["follow", "track"].includes(action) && (!readyRef.current || Date.now() - confirmedAt.current > 8000)) return;
    pendingRef.current = true;
    if (action !== "state") setBusy(true);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/nearby/${action}`, {
        method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", ...accountHeaders(session), ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json() as NearbySnapshot & { token?: string; error?: string };
      if (!mountedRef.current || startedEpoch !== epoch.current) {
        if (result.token) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${result.token}` }, body: "{}", keepalive: true }).catch(() => {});
        return;
      }
      if (!response.ok) {
        if (result.error === "AUTH_EXPIRED") demoHost.expire();
        if (response.status === 401) { tokenRef.current = null; setSnapshot(null); }
        throw new Error(messages[result.error ?? ""] ?? "操作失败，请重试");
      }
      confirmedAt.current = Date.now();
      serverOffset.current = Number.isFinite(result.serverTime) ? result.serverTime - confirmedAt.current : 0;
      readyRef.current = true; setReady(true); setNow(Date.now() + serverOffset.current);
      setError(null);
      if (result.token) tokenRef.current = result.token;
      if (!enterSession(result, action === "accept")) setSnapshot(result);
    } catch (reason) {
      if (mountedRef.current && startedEpoch === epoch.current) {
        readyRef.current = false; setReady(false);
        setError(reason instanceof Error && reason.name !== "AbortError" && reason.name !== "TypeError" ? reason.message : action === "start" ? "暂未连上，请稍后再试" : "连接不稳，正在重连…");
      }
    } finally {
      clearTimeout(deadline); pendingRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        if (startedEpoch !== epoch.current && tokenRef.current && navigator.onLine && !enteringRef.current) void perform("state");
      }
    }
  }, [enterSession, session]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setInterval(() => { if (tokenRef.current && !enteringRef.current && navigator.onLine) void request("state"); }, 2500);
    const clock = setInterval(() => {
      setNow(Date.now() + serverOffset.current);
      if (tokenRef.current && Date.now() - confirmedAt.current > 8000) { readyRef.current = false; setReady(false); }
    }, 1000);
    const invalidate = () => { epoch.current++; readyRef.current = false; setReady(false); };
    const offline = () => { invalidate(); setError("网络已断开，连上后自动恢复"); };
    const restore = () => {
      if (document.visibilityState === "hidden" || enteringRef.current) return;
      invalidate();
      if (tokenRef.current) { setError("正在刷新附近…"); void request("state"); }
      else if (navigator.onLine) setError(null);
    };
    const stopPresence = () => {
      invalidate();
      if (tokenRef.current) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${tokenRef.current}` }, body: "{}", keepalive: true }).catch(() => {});
      tokenRef.current = null; setSnapshot(null);
    };
    window.addEventListener("pagehide", stopPresence);
    window.addEventListener("pageshow", restore);
    window.addEventListener("online", restore);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", restore);
    return () => {
      mountedRef.current = false; clearInterval(timer); clearInterval(clock);
      window.removeEventListener("pagehide", stopPresence); stopPresence();
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("online", restore);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [request, session]);
  return { snapshot, busy, error, ready, online, now, room, joined, request, leaveSession };
}
