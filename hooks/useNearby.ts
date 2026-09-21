"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { NearbySnapshot } from "@/lib/resonance/nearby-protocol";
import { accountHeaders, type HostSession } from "@/lib/resonance/host-protocol";
import { demoHost } from "@/lib/resonance/demo-host";

const messages: Record<string, string> = {
  AUTH_EXPIRED: "宿主授权已失效，请重新读取登录状态。", ALREADY_DISCOVERING: "当前账号已在另一页开启发现；异常离线状态最多保留 30 秒。",
  SESSION_EXPIRED: "发现已暂停，请重新开启。", UNAVAILABLE: "对方已离开，试试其他音乐吧。",
  BUSY: "你或对方已有一份待处理邀请，请稍后再试。", COOLDOWN: "稍等片刻再邀请；同一听众每分钟可邀请一次。",
  INVITE_EXPIRED: "邀请已失效，请查看最新状态。", AREA_FULL: "当前听众较多，请稍后再试。",
  FORBIDDEN: "这份邀请不能由你处理。",
};

const subscribeNetwork = (notify: () => void) => {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};
const readOnline = () => navigator.onLine;
const serverOnline = () => true;

export function useNearby(session: HostSession) {
  const router = useRouter();
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
  const enteringRef = useRef(false);

  const enterSession = useCallback((next: NearbySnapshot) => {
    if (!next.ticket || enteringRef.current) return;
    try {
      sessionStorage.setItem(`resonance.nearby-room.${session.accountId}.${next.ticket.roomId}`, next.ticket.token);
      enteringRef.current = true;
      router.push(`/room/${next.ticket.roomId}`);
    } catch { setError("浏览器无法保存本次会话，请允许此站点使用会话存储后重试。"); }
  }, [router, session.accountId]);

  const request = useCallback(async function perform(action: string, body?: object) {
    if (action === "stop") {
      const token = tokenRef.current;
      epoch.current++; tokenRef.current = null; readyRef.current = false;
      setSnapshot(null); setReady(false);
      setError(navigator.onLine ? null : "已暂停发现；服务器上的离线状态最多保留 30 秒。");
      if (token) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${token}` }, body: "{}", keepalive: true }).catch(() => {
        if (mountedRef.current && !tokenRef.current) setError("已暂停发现；服务器上的离线状态最多保留 30 秒。");
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
    if (["invite", "respond", "track"].includes(action) && (!readyRef.current || Date.now() - confirmedAt.current > 8000)) return;
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
        throw new Error(messages[result.error ?? ""] ?? "暂时无法完成操作，请重试。");
      }
      confirmedAt.current = Date.now();
      serverOffset.current = Number.isFinite(result.serverTime) ? result.serverTime - confirmedAt.current : 0;
      readyRef.current = true; setReady(true); setNow(Date.now() + serverOffset.current);
      setError(null);
      if (result.token) tokenRef.current = result.token;
      setSnapshot(result); enterSession(result);
    } catch (reason) {
      if (mountedRef.current && startedEpoch === epoch.current) {
        readyRef.current = false; setReady(false);
        setError(reason instanceof Error && reason.name !== "AbortError" && reason.name !== "TypeError" ? reason.message : action === "start" ? "尚未确认是否开启成功，请稍后重试；未恢复的发现会在 30 秒后自动暂停。" : "连接暂时中断，正在确认最新状态；暂不可发送或回应邀请。");
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
    const offline = () => { invalidate(); setError("网络已断开，恢复连接后确认发现和邀请状态。"); };
    const restore = () => {
      if (document.visibilityState === "hidden" || enteringRef.current) return;
      invalidate();
      if (tokenRef.current) { setError("正在确认最新发现状态…"); void request("state"); }
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
  return { snapshot, busy, error, ready, online, now, request, enterSession };
}
