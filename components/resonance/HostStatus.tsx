"use client";
import { useState } from "react";
import { ArrowUpRight, Headphones, Info, LogOut, Radio, RefreshCw } from "lucide-react";
import { useHost } from "./HostProvider";
import { BlockedListeners } from "./ListenerSafety";
import { demoHost } from "@/lib/resonance/demo-host";

type ExperienceSource = "demo" | "online";
export function HostStatus({ onSelectSource }: { onSelectSource?: (source: ExperienceSource) => void } = {}) {
  const host = useHost();
  if (host.status === "signed-out" || host.status === "expired") return <LoginPicker expired={host.status === "expired"} onSelectSource={onSelectSource} />;
  return <section className="plugin-host-status" role="status"><Radio size={28} aria-hidden="true" /><h2>{host.status === "loading" ? "正在准备音乐体验" : "暂时连不上"}</h2><p>{host.error ?? "稍等一下，音乐就来。"}</p>{host.status !== "loading" && <button className="room-primary" onClick={() => void demoHost.requestAuthorization()}><RefreshCw size={16} aria-hidden="true" />重新连接</button>}</section>;
}

function LoginPicker({ expired, onSelectSource }: { expired: boolean; onSelectSource?: (source: ExperienceSource) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      onSelectSource?.("demo");
      const result = await demoHost.switchAccount("A");
      if (result.status !== "ready") setError(result.error ?? "暂时无法进入，请重试");
    } catch { setError("暂时无法进入，请允许浏览器保存网站数据后重试"); }
    finally { setBusy(false); }
  }
  return <section className="account-login" aria-labelledby="account-login-title">
    <div className="login-heading">
      <div><p className="login-kicker"><span />RESONANCE</p><h1 id="account-login-title">一首歌，<br /><span>遇见同频。</span></h1><p className="login-subtitle">{expired ? "体验已过期，重新进入就好。" : "好音乐，值得一起听。"}</p></div>
      <div className="login-orbit" aria-hidden="true"><span className="login-orbit-ring" /><span className="login-orbit-core"><Headphones size={28} strokeWidth={1.3} /></span><span className="login-orbit-star" /><span className="login-orbit-note" /></div>
    </div>
    <button type="button" className="tp-btn tp-btn--primary tp-login-start" disabled={busy} aria-busy={busy} onClick={() => void login()}><Headphones size={18} aria-hidden="true" /><span>{busy ? "正在进入…" : expired ? "重新体验" : "开始体验"}</span><ArrowUpRight size={19} aria-hidden="true" /></button>
    <p className="account-login-note">概念演示 · 听众与地点为示例，体验记录会保留。</p>
    {error && <p className="room-error" role="alert">{error}</p>}
  </section>;
}

export function AccountControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try { await demoHost.logout(); } catch { setError("退出失败，请重试"); } finally { setBusy(false); }
  }
  return <div className="account-controls tp-experience-settings"><BlockedListeners /><details className="tp-about"><summary><Info size={16} aria-hidden="true" />关于同频</summary><p>QQ 音乐非官方概念演示。</p><a href="/covers/SOURCES.md" target="_blank" rel="noreferrer">专辑封面来源</a><a href="/assets/ambient/SOURCES.txt" target="_blank" rel="noreferrer">背景素材 · Solar / CC BY 4.0</a><a href="/assets/interaction/SOURCES.txt" target="_blank" rel="noreferrer">图标 · Solar / 480 Design / CC BY 4.0</a></details><button type="button" disabled={busy} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />{busy ? "正在退出…" : "退出体验"}</button>{error && <span role="alert">{error}</span>}</div>;
}
