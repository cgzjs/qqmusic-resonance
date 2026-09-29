"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, Pause, Play, Volume2 } from "lucide-react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { formatTime } from "@/lib/resonance/library";
import type { ReactionDelivery, ReactionKind, RoomReaction, RoomRole } from "@/lib/resonance/room-protocol";
import type { AudioTrack } from "@/lib/resonance/types";
import type { ResonancePlayer } from "@/hooks/useResonancePlayer";
import { ListeningArtwork } from "./ListeningArtwork";
import { ReactionDock } from "./ReactionDock";

const percent = (value: number, max: number) => ({ "--p": `${max ? Math.min(100, value / max * 100) : 0}%` }) as CSSProperties;

export type RoomStageBody = {
  mode: "demo" | "online";
  track?: AudioTrack;
  role: RoomRole | null;
  selfOnline: boolean;
  peerOnline: boolean;
  outgoing: ReactionDelivery | null;
  incoming: RoomReaction | null;
  /** 房主可拖进度、切歌、一起播放；跟听的一方只看到同步状态。 */
  seekable: boolean;
  onSeek: (position: number) => void;
  progressData?: Record<`data-${string}`, string | number | boolean>;
  host?: { playing: boolean; disabled: boolean; trackId: string; onToggle: () => void; onTrack: (trackId: string) => void };
  follow?: { text: string; playing: boolean };
  waiting?: ReactNode;
  notice?: ReactNode;
  reaction: { disabled: boolean; disabledHint: string; onSend: (kind: ReactionKind) => void };
  gift: ReactNode;
  leaveLabel: string;
  safety?: ReactNode;
};

type Props = {
  variant: "page" | "inline";
  headerExtra?: ReactNode;
  status: string;
  connected: boolean;
  player: ResonancePlayer;
  onLeave: () => void;
  body: RoomStageBody | null;
  before?: ReactNode;
  after?: ReactNode;
};

// 一起听的界面：真实房间和模拟听众共用，差别只在数据从哪来。
export function RoomStage({ variant, headerExtra, status, connected, player, onLeave, body, before, after }: Props) {
  const [draftPosition, setDraftPosition] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const [quiet, setQuiet] = useState(false);
  function commitSeek() {
    const value = draftRef.current;
    draftRef.current = null; setDraftPosition(null);
    if (value !== null && body?.seekable) body.onSeek(value);
  }
  const total = player.duration || body?.track?.duration || 0;
  const position = draftPosition ?? player.currentTime;
  return <div className="tp-room tp-room-session" data-variant={variant} data-audio-status={player.status}>
    <header className={variant === "page" ? "tp-top tp-room-top" : "tp-room-top tp-room-head"}><button type="button" className="tp-icon-btn" aria-label="返回附近" onClick={onLeave}><ArrowLeft size={20} aria-hidden="true" /></button><div className="tp-room-title"><h1>一起听</h1><span className="tp-room-status" data-connected={connected} role="status">{status}</span></div>{headerExtra}</header>
    <div className="tp-room-body">
      {before}
      {body && <>
        {body.track && <div className="tp-now"><ListeningArtwork key={body.track.id} track={body.track} mode={body.mode} role={body.role} outgoing={body.outgoing} incoming={body.incoming} selfOnline={body.selfOnline} peerOnline={body.peerOnline} quiet={quiet} /><h2>{body.track.track}</h2><p>{body.track.artist}</p></div>}
        {body.waiting ? body.waiting : <>
        <div className="tp-room-progress" {...body.progressData}><input type="range" aria-label="房间播放进度" min={0} max={total} step={.1} value={position} style={percent(position, total)} disabled={!body.seekable || !player.duration} onChange={event => { draftRef.current = Number(event.target.value); setDraftPosition(draftRef.current); }} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} onPointerCancel={() => { draftRef.current = null; setDraftPosition(null); }} /><div><span>{formatTime(position)}</span><span>{formatTime(total)}</span></div></div>
        {body.host ? <div className="tp-room-controls"><button type="button" className="tp-btn tp-btn--primary" disabled={body.host.disabled} onClick={body.host.onToggle}>{body.host.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{body.host.playing ? "一起暂停" : "一起播放"}</button><label className="tp-select"><span className="sr-only">歌曲</span><select aria-label="房间曲目" value={body.host.trackId} disabled={body.host.disabled} onChange={event => body.host?.onTrack(event.target.value)}>{audioTracks.map(track => <option key={track.id} value={track.id}>{track.track}</option>)}</select></label></div> : body.follow && <p className="tp-follow" data-playing={body.follow.playing}>{body.follow.text}</p>}
        <label className="tp-volume"><Volume2 size={18} aria-hidden="true" /><span>我的音量</span><input type="range" aria-label="我的音量" min={0} max={1} step={.05} value={player.volume} style={percent(player.volume, 1)} onChange={event => player.changeVolume(Number(event.target.value))} /></label>
        {body.notice}
        <ReactionDock mode={body.mode} disabled={body.reaction.disabled} disabledHint={body.reaction.disabledHint} outgoing={body.outgoing} incoming={body.incoming} onSend={body.reaction.onSend} quiet={quiet} onQuietChange={setQuiet} />
        {body.gift}
        </>}
        <div className="tp-room-foot"><button type="button" className="tp-btn tp-btn--quiet" onClick={onLeave}>{body.leaveLabel}</button>{body.safety}</div>
      </>}
      {after}
      <p className="tp-footnote">每次一起听最长 2 小时</p>
    </div>
  </div>;
}
