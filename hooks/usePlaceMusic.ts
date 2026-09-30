"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { accountHeaders, type HostSession } from "@/lib/resonance/host-protocol";
import { demoHost } from "@/lib/resonance/demo-host";
import { UUID_PATTERN } from "@/lib/resonance/room-protocol";
import { DEMO_PLACE_LOCATION, type LocationFix, type PlaceCommand, type PlaceSnapshot } from "@/lib/resonance/place-protocol";

const errors: Record<string, string> = { LEAVE_COOLDOWN: "刚留过一首歌，半分钟后再来吧", PLACE_LIMIT: "附近留声暂时满了，请稍后再试", NOTE_LIMIT: "这里的留言暂时满了", INVALID_NOTE: "请填写标题、留言并选择一首歌", LOCATION_REQUIRED: "定位不够准确或已过期，请重新定位", NOTE_NOT_FOUND: "这条留言已不在这里", REQUEST_CONFLICT: "这次操作已变化，请刷新后再试" };
function restored(key: string): PlaceCommand | null {
  try { const item = JSON.parse(sessionStorage.getItem(key) ?? "null") as PlaceCommand | null; return item && ["leave", "withdraw"].includes(item.action) && UUID_PATTERN.test(item.body?.id ?? "") ? item : null; } catch { return null; }
}
function locate(experience: "demo" | "online"): Promise<LocationFix> {
  if (experience === "demo") return Promise.resolve({ ...DEMO_PLACE_LOCATION, timestamp: Date.now() });
  if (!navigator.geolocation) return Promise.reject(new Error("当前浏览器不支持定位，请在支持定位的浏览器打开"));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(position => {
    if (position.coords.accuracy > 500) { reject(new Error("定位误差较大，请到信号更好的地方重试")); return; }
    resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp });
  }, error => reject(new Error(error.code === 1 ? "请允许位置权限，才能听见附近的歌" : error.code === 3 ? "定位超时，请重试" : "暂时无法获取位置，请检查定位设置后重试")), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }));
}
export function usePlaceMusic(session: HostSession, experience: "demo" | "online") {
  const key = `resonance.place.pending.${session.accountId}.${experience}`;
  const [data, setData] = useState<PlaceSnapshot>({ places: [], notes: [], placeId: null });
  const [pending, setPending] = useState<PlaceCommand | null>(() => restored(key));
  const pendingRef = useRef(pending);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [ready, setReady] = useState(false);
  const busyRef = useRef(false), epoch = useRef(0), controllers = useRef(new Set<AbortController>());
  const remember = useCallback((command: PlaceCommand | null) => {
    pendingRef.current = command; setPending(command);
    try { if (command) sessionStorage.setItem(key, JSON.stringify(command)); else sessionStorage.removeItem(key); } catch { /* In-memory ids still protect retries. */ }
  }, [key]);
  const perform = useCallback(async (command?: PlaceCommand) => {
    if (busyRef.current) return null;
    if (!navigator.onLine) { setError("网络已断开，连上后再试"); return null; }
    busyRef.current = true; setBusy(true); setError(null);
    const generation = epoch.current;
    const controller = new AbortController(); controllers.current.add(controller);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let submitted = false;
    try {
      const location = await locate(experience);
      if (generation !== epoch.current) return null;
      if (command) remember(command);
      const query = new URLSearchParams({ experience });
      deadline = setTimeout(() => controller.abort(), 8000); submitted = true;
      const response = await fetch(`/api/bottles/${command?.action ?? "nearby"}?${query}`, { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(session) }, body: JSON.stringify({ ...command?.body, ...location }), cache: "no-store", signal: controller.signal });
      const result = await response.json() as PlaceSnapshot & { error?: string };
      if (generation !== epoch.current) return null;
      if (!response.ok) {
        if (command && response.status < 500) remember(null);
        if (response.status === 401) { demoHost.expire(); return null; }
        throw new Error(errors[result.error ?? ""] ?? "暂时连不上，请重试");
      }
      if (command) remember(null);
      setData(result); setReady(true); return result;
    } catch (reason) {
      if (generation === epoch.current) { setReady(false); setError(submitted && pendingRef.current ? "送达未确认，重试这次操作不会重复留下内容" : reason instanceof Error && !["TypeError", "AbortError"].includes(reason.name) ? reason.message : "暂时连不上，请重试"); }
      return null;
    } finally {
      clearTimeout(deadline); controllers.current.delete(controller);
      if (generation === epoch.current) { busyRef.current = false; setBusy(false); }
    }
  }, [experience, remember, session]);
  const disconnect = useCallback(() => { epoch.current++; busyRef.current = false; for (const controller of controllers.current) controller.abort(); }, []);
  useEffect(() => {
    const start = setTimeout(() => void perform(), 0);
    return () => { clearTimeout(start); disconnect(); };
  }, [perform, disconnect]);
  return { data, busy, ready, pending, error, refresh: () => perform(), act: (command: PlaceCommand) => !pendingRef.current ? perform(command) : Promise.resolve(null), retry: () => pendingRef.current ? perform(pendingRef.current) : perform() };
}
