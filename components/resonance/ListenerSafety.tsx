"use client";

import { useEffect, useState } from "react";
import { Ban, ShieldCheck } from "lucide-react";
import { useHost } from "./HostProvider";
import { useListenerSafety } from "@/hooks/useListenerSafety";
import type { BlockedListener } from "@/lib/resonance/nearby-protocol";

type BlockProps = { target: { targetId: string } | { roomId: string }; alias: string; disabled?: boolean; onBlocked?: () => void };

export function BlockListenerButton({ target, alias, disabled, onBlocked }: BlockProps) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const { run, busy, error } = useListenerSafety();
  async function block() {
    const result = await run("block", target);
    if (!result) return;
    setDone(true); setConfirming(false); onBlocked?.();
  }
  return <div className="listener-safety">
    {done ? <p role="status">已屏蔽，可在设置中解除。</p> : confirming ? <div className="listener-block-confirm" role="group" aria-label={`屏蔽${alias}`}>
      <p>屏蔽后互不出现在附近，也无法邀请。{"roomId" in target ? "本次共听将结束。" : "待处理邀请会取消。"}</p>
      <div><button type="button" className="room-secondary" disabled={busy} onClick={() => setConfirming(false)}>取消</button><button type="button" className="room-secondary" disabled={busy || disabled} onClick={() => void block()}>{busy ? "正在屏蔽…" : "确认屏蔽"}</button></div>
    </div> : <button type="button" className="listener-block-trigger" disabled={disabled} aria-label={`屏蔽${alias}`} onClick={() => setConfirming(true)}><Ban size={14} aria-hidden="true" />屏蔽</button>}
    {error && <p className="listener-safety-error" role="alert">{error}</p>}
  </div>;
}

export function BlockedListeners() {
  const host = useHost();
  const [open, setOpen] = useState(false);
  if (!host.session || host.status !== "ready") return null;
  return <details className="blocked-listeners" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><ShieldCheck size={16} aria-hidden="true" />已屏蔽听众</summary>
    {open && <BlockedList key={host.session.token} />}
  </details>;
}

function BlockedList() {
  const { run, busy, error } = useListenerSafety();
  const [entries, setEntries] = useState<BlockedListener[] | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void run("blocks").then(result => { if (active && result) setEntries(result.blocks); });
    return () => { active = false; };
  }, [run]);
  async function refresh() { const result = await run("blocks"); if (result) setEntries(result.blocks); }
  async function unblock(id: string) {
    const result = await run("unblock", { id });
    if (result) { setEntries(result.blocks); setNotice("已解除屏蔽，旧邀请和共听不会恢复。"); }
  }
  return <div className="blocked-list-content">
    <p>解除后可再次相遇，对方也屏蔽了你时除外。</p>
    <button type="button" className="listener-block-trigger" disabled={busy} onClick={() => void refresh()}>刷新列表</button>
    {entries?.map(entry => <div className="blocked-list-row" key={entry.id}><span>{entry.alias}<small>{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</small></span><button type="button" disabled={busy} aria-label={`解除屏蔽${entry.alias}`} onClick={() => void unblock(entry.id)}>解除屏蔽</button></div>)}
    {!error && <p role="status">{entries === null ? "正在读取…" : !entries.length ? "还没有屏蔽的听众。" : null}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="listener-safety-error" role="alert">{error}</p>}
  </div>;
}
