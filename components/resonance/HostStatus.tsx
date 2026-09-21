"use client";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, Headphones, Radio, RefreshCw } from "lucide-react";
import { useHost } from "./HostProvider";
import { demoHost, hostFetch } from "@/lib/resonance/demo-host";
import { audioTracks } from "@/lib/resonance/demo-data";

export function HostStatus() {
  const host = useHost();
  if (host.status === "signed-out" || host.status === "expired") return <LoginPicker expired={host.status === "expired"} />;
  return <section className="plugin-host-status" role="status"><Radio size={28} aria-hidden="true" /><h2>{host.status === "loading" ? "正在读取登录状态" : "连接暂不可用"}</h2><p>{host.error ?? "同频沿用 QQ 音乐账号，不需要另外注册。"}</p>{host.status !== "loading" && <button className="room-primary" onClick={() => void demoHost.requestAuthorization()}><RefreshCw size={16} aria-hidden="true" />重新连接</button>}</section>;
}

function LoginPicker({ expired }: { expired: boolean }) {
  const [busy, setBusy] = useState<"A" | "B" | null>(null);
  const [error, setError] = useState("");
  async function login(slot: "A" | "B") {
    if (busy) return;
    setBusy(slot); setError("");
    try {
      const result = await demoHost.switchAccount(slot);
      if (result.status !== "ready") setError(result.error ?? "登录未完成，请重试。");
    } catch { setError("登录未完成，请检查浏览器存储权限后重试。"); }
    finally { setBusy(null); }
  }
  return <section className="account-login" aria-labelledby="account-login-title">
    <div className="login-heading">
      <div><p className="login-kicker"><span />RESONANCE / SIGN IN</p><h1 id="account-login-title">登录<span>同频</span></h1><p className="login-subtitle">{expired ? "重新登录，继续这场相遇。" : "好音乐，值得一起听。"}</p></div>
      <div className="login-orbit" aria-hidden="true"><span className="login-orbit-ring" /><span className="login-orbit-core"><Headphones size={28} strokeWidth={1.3} /></span><span className="login-orbit-star" /><span className="login-orbit-note" /></div>
    </div>
    <div className="login-selection-label"><span>选择你的身份</span><span aria-hidden="true">A / B</span></div>
    <div className="account-login-options">{(["A", "B"] as const).map(slot => <button type="button" key={slot} data-side={slot} disabled={!!busy} onClick={() => void login(slot)} aria-label={`登录听众 ${slot}`}>
      <span className="login-card-top" aria-hidden="true"><span>SIDE {slot}</span><span className="login-card-bars"><i /><i /><i /><i /><i /></span></span>
      <span className="login-record" aria-hidden="true"><span className="login-record-grooves" /><span className="login-record-label">{slot}<i /></span></span>
      <span className="login-card-bottom"><span><strong>听众 {slot}</strong><small>{busy === slot ? "正在登录…" : "进入同频"}</small></span><span className="login-card-arrow" aria-hidden="true"><ArrowUpRight size={20} strokeWidth={1.5} /></span></span>
    </button>)}</div>
    <p className="account-login-note">双页测试时，分别选择 A / B。</p>
    {error && <p className="room-error" role="alert">{error}</p>}
  </section>;
}

export function AccountControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try { await demoHost.logout(); } catch { setError("退出未完成，请重试。"); } finally { setBusy(false); }
  }
  return <div className="account-controls"><button type="button" disabled={busy} onClick={() => demoHost.chooseAccount()}>切换账号</button><button type="button" disabled={busy} onClick={() => void logout()}>{busy ? "正在退出…" : "退出登录"}</button>{error && <span role="alert">{error}</span>}</div>;
}

export function MockHostPanel({ children }: { children?: ReactNode } = {}) {
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
  return <details className="plugin-debug"><summary>设置</summary><p>账号、当前歌曲均为模拟输入，未连接 QQ 音乐；附近范围也是演示区域。</p><a className="interaction-credit" href="/nearby?mode=online" target="_blank" rel="noopener noreferrer">打开另一个双人联调页面 ↗</a><a href="/covers/SOURCES.md" target="_blank" rel="noreferrer" className="interaction-credit">专辑封面来源</a><a href="/assets/interaction/SOURCES.txt" target="_blank" rel="noreferrer" className="interaction-credit">互动图标：Solar / 480 Design · CC BY 4.0</a><div>{children}<label>宿主账号<select aria-label="模拟宿主账号" disabled={busy} value={host.session?.displayName.endsWith("B") ? "B" : "A"} onChange={event => void run(() => demoHost.switchAccount(event.target.value as "A" | "B"))}><option value="A">模拟听众 A</option><option value="B">模拟听众 B</option></select></label><label>当前歌曲<select aria-label="模拟宿主当前歌曲" disabled={!host.session || busy} value={host.trackId ?? "none"} onChange={event => demoHost.setTrack(event.target.value === "none" ? null : event.target.value)}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}<option value="none">没有选中的歌曲</option></select></label></div>{host.session && <div className="plugin-debug-actions"><button className="room-secondary" disabled={busy} onClick={() => void run(() => demoHost.logout())}>模拟 QQ 音乐退出</button><button className="room-secondary" disabled={busy} onClick={() => void run(expireHost)}>模拟授权失效</button></div>}{error && <p role="alert">{error}</p>}</details>;
}
