"use client";
import { useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { useHost } from "./HostProvider";
import { demoHost, hostFetch } from "@/lib/resonance/demo-host";
import { audioTracks } from "@/lib/resonance/demo-data";

export function HostStatus() {
  const host = useHost();
  return <section className="plugin-host-status" role="status"><Radio size={28} aria-hidden="true" /><h2>{host.status === "loading" ? "正在读取 QQ 音乐状态" : host.status === "signed-out" ? "请先在 QQ 音乐登录" : host.status === "expired" ? "登录授权需要更新" : "等待宿主连接"}</h2><p>{host.error ?? "同频沿用 QQ 音乐账号，不需要另外注册。"}</p>{host.status !== "loading" && <button className="room-primary" onClick={() => void demoHost.requestAuthorization()}><RefreshCw size={16} aria-hidden="true" />{host.status === "signed-out" ? "模拟宿主重新登录" : "重新读取宿主"}</button>}</section>;
}

export function MockHostPanel() {
  const host = useHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!host.session && !["signed-out", "expired"].includes(host.status)) return null;
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); } catch { setError("模拟宿主操作失败，请检查连接后重试。"); }
    finally { setBusy(false); }
  }
  async function expireHost() {
    await hostFetch("logout", host.session, {});
    demoHost.expire();
  }
  return <details className="plugin-debug"><summary>模拟宿主 · 本地调试</summary><p>账号、当前歌曲均为模拟输入，未连接 QQ 音乐；附近范围也是演示区域。</p><a href="/assets/interaction/SOURCES.txt" target="_blank" rel="noreferrer" className="interaction-credit">互动图标：Solar / 480 Design · CC BY 4.0</a><div><label>宿主账号<select aria-label="模拟宿主账号" disabled={busy} value={host.session?.displayName.endsWith("B") ? "B" : "A"} onChange={event => void run(() => demoHost.switchAccount(event.target.value as "A" | "B"))}><option value="A">模拟听众 A</option><option value="B">模拟听众 B</option></select></label><label>当前歌曲<select aria-label="模拟宿主当前歌曲" disabled={!host.session || busy} value={host.trackId ?? "none"} onChange={event => demoHost.setTrack(event.target.value === "none" ? null : event.target.value)}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}<option value="none">没有选中的歌曲</option></select></label></div>{host.session && <div className="plugin-debug-actions"><button className="room-secondary" disabled={busy} onClick={() => void run(() => demoHost.logout())}>模拟 QQ 音乐退出</button><button className="room-secondary" disabled={busy} onClick={() => void run(expireHost)}>模拟授权失效</button></div>}{error && <p role="alert">{error}</p>}</details>;
}
