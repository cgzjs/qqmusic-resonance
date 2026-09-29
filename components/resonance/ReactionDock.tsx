"use client";
import { useEffect, useState } from "react";
import { audioTracks } from "@/lib/resonance/demo-data";
import type { ReactionDelivery, ReactionKind, RoomReaction } from "@/lib/resonance/room-protocol";

export function InteractionGlyph({ kind, className = "" }: { kind: ReactionKind | "exchange"; className?: string }) {
  return <span className={`interaction-glyph ${className}`} data-kind={kind} aria-hidden="true" />;
}
const errors: Record<string, string> = {
  RATE_LIMIT: "慢一点，给回应留点时间。", PEER_OFFLINE: "TA 暂时掉线了",
  TRACK_CHANGED: "刚换了歌，请重新回应", REACTION_EXPIRED: "回应已过期，请重发",
  CONNECTION_LOST: "连接断开，可能未送达", DELIVERY_UNCONFIRMED: "暂未确认送达，稍后再发",
};

type Props = { mode: "demo" | "online"; disabled?: boolean; disabledHint?: string; outgoing?: ReactionDelivery | null; incoming?: RoomReaction | null; onSend: (kind: ReactionKind) => void; quiet?: boolean; onQuietChange?: (quiet: boolean) => void };
export function ReactionDock({ mode, disabled = false, disabledHint = "等双方在线，再回应这首歌", outgoing, incoming, onSend, quiet: controlledQuiet, onQuietChange }: Props) {
  const [cooldown, setCooldown] = useState(false);
  const [localQuiet, setLocalQuiet] = useState(false);
  const quiet = controlledQuiet ?? localQuiet;
  function toggleQuiet() { setLocalQuiet(!quiet); onQuietChange?.(!quiet); }
  const current = outgoing;
  const busy = current?.status === "sending" || current?.status === "sent";
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 2000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function send(kind: ReactionKind) {
    if (disabled || busy || cooldown) return;
    setCooldown(true);
    onSend(kind);
  }
  const caption = mode === "demo" ? current?.status === "failed" ? "暂未确认送出，请重试。" : current?.status === "sending" ? "正在送出…" : busy ? "已送出，等 TA 回应。可以先去逛逛" : current?.status === "received" ? "TA 也喜欢这首歌" : "喜欢这首，就告诉 TA" :
    disabled ? disabledHint : current?.status === "failed" ? errors[current.error ?? ""] ?? "发送未完成，请重试。" :
    current?.status === "sending" ? "正在发送…" : current?.status === "sent" ? "已发出，等 TA 收到…" : current?.status === "received" ? "TA 知道你喜欢了" : "喜欢这首，就告诉 TA";
  const delivered = current?.status === "received" ? current : null;
  const incomingTrack = audioTracks.find(track => track.id === incoming?.trackId)?.track;
  return <section className="reaction-dock" data-quiet={quiet} aria-label="音乐回应">
    <div className="reaction-dock-heading"><span>喜欢</span><button type="button" aria-pressed={quiet} onClick={toggleQuiet}>{quiet ? "打开动画" : "关闭动画"}</button></div>
    <div className="reaction-signal" aria-hidden="true"><span className="reaction-endpoint">YOU</span><span className="reaction-rail" /><span className="reaction-endpoint">TA</span>
      <span className="reaction-star reaction-star--one" /><span className="reaction-star reaction-star--two" />
      {!delivered && !incoming && <span className="reaction-idle-note" />}
      {delivered && <span key={delivered.id} className="reaction-flight" data-kind={delivered.kind} data-direction="outgoing" data-obscured={!!incoming}><InteractionGlyph kind={delivered.kind} /><span className="reaction-spark" /><span className="reaction-spark reaction-spark--two" /></span>}
      {incoming && <span key={incoming.id} className="reaction-flight" data-kind={incoming.kind} data-direction="incoming"><InteractionGlyph kind={incoming.kind} /><span className="reaction-spark" /><span className="reaction-spark reaction-spark--two" /></span>}
    </div>
    <div className="reaction-actions"><button type="button" className="reaction-action" disabled={disabled || busy || cooldown} onClick={() => send("heart")}><InteractionGlyph kind="heart" /><span>喜欢</span></button></div>
    <p className="reaction-status" data-error={current?.status === "failed"} role="status" aria-live="polite">{incoming ? `TA 也喜欢这首${incomingTrack ? ` · ${incomingTrack}` : ""}` : caption}</p>
  </section>;
}

export function ExchangeSignal({ sending = false, received = false }: { sending?: boolean; received?: boolean }) {
  return <div className="exchange-signal" data-sending={sending} data-received={received} aria-hidden="true"><span className="exchange-signal-sleeve"><InteractionGlyph kind="exchange" /></span><span className="exchange-signal-trail"><i /><i /><i /></span><span className="exchange-signal-sleeve exchange-signal-sleeve--return"><InteractionGlyph kind={received ? "heart" : "exchange"} /></span></div>;
}
