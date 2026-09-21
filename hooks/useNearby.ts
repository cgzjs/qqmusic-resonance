"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { NearbySnapshot } from "@/lib/resonance/nearby-protocol";
import { accountHeaders, type HostSession } from "@/lib/resonance/host-protocol";
import { demoHost } from "@/lib/resonance/demo-host";

const messages: Record<string, string> = {
  AUTH_EXPIRED: "宿主授权已失效，请重新读取登录状态。", ALREADY_DISCOVERING: "当前账号已在另一页开启发现；异常离线状态最多保留 30 秒。",
  SESSION_EXPIRED: "发现已暂停，请重新开启。", UNAVAILABLE: "对方已离开，试试其他音乐吧。",
  BUSY: "你或对方已有一份待处理邀请，请稍后再试。", COOLDOWN: "稍等片刻再邀请；同一听众每分钟可邀请一次。",
  INVITE_EXPIRED: "邀请已失效，请查看最新状态。", AREA_FULL: "演示区域暂时已满，请稍后再试。",
  FORBIDDEN: "这份邀请不能由你处理。",
};

export function useNearby(session: HostSession) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<NearbySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const request = useCallback(async (action: string, body?: object) => {
    if (pendingRef.current && action === "state") return;
    // A heartbeat must not swallow a user click. Mutations wait for it to settle.
    while (pendingRef.current) await new Promise(resolve => setTimeout(resolve, 50));
    if (!mountedRef.current) return;
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
      if (!mountedRef.current) {
        if (result.token) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${result.token}` }, body: "{}", keepalive: true }).catch(() => {});
        return;
      }
      if (!response.ok) {
        if (result.error === "AUTH_EXPIRED") demoHost.expire();
        if (response.status === 401) { tokenRef.current = null; setSnapshot(null); }
        throw new Error(messages[result.error ?? ""] ?? "暂时无法完成操作，请重试。");
      }
      setError(null);
      if (action === "stop") { tokenRef.current = null; setSnapshot(null); }
      else {
        if (result.token) tokenRef.current = result.token;
        setSnapshot(result); enterSession(result);
      }
    } catch (reason) {
      if (mountedRef.current) setError(reason instanceof Error && reason.name !== "AbortError" && reason.name !== "TypeError" ? reason.message : "连接暂时中断，正在重试；离线后会自动停止被发现。");
    } finally { clearTimeout(deadline); pendingRef.current = false; if (mountedRef.current) setBusy(false); }
  }, [enterSession, session]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setInterval(() => { if (tokenRef.current && !enteringRef.current) void request("state"); }, 2500);
    const stopPresence = () => {
      if (tokenRef.current) void fetch("/api/nearby/stop", { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session), Authorization: `Bearer ${tokenRef.current}` }, body: "{}", keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", stopPresence);
    return () => {
      mountedRef.current = false; clearInterval(timer);
      window.removeEventListener("pagehide", stopPresence); stopPresence();
    };
  }, [request, session]);
  return { snapshot, busy, error, request, enterSession };
}
