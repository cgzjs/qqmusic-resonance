"use client";

import { useEffect, useState } from "react";
import { Headphones, UserRound } from "lucide-react";
import { AlbumTile } from "./AlbumTile";
import { InteractionGlyph } from "./ReactionDock";
import type { AudioTrack } from "@/lib/resonance/types";
import type { ReactionDelivery, ReactionKind, RoomReaction, RoomRole } from "@/lib/resonance/room-protocol";

type Cue = { id: string; kind: ReactionKind };
type Props = { track: AudioTrack; mode: "demo" | "online"; role?: RoomRole | null; outgoing?: ReactionDelivery | null; incoming?: RoomReaction | null; selfOnline?: boolean; peerOnline?: boolean; quiet?: boolean };

function ListenerAvatar({ person, online, cue, quiet }: { person: "self" | "peer"; online: boolean; cue?: Cue; quiet: boolean }) {
  // A record already present when entering the page is history, not a fresh gesture.
  const [initialCue] = useState(cue?.id);
  const [expiredCue, setExpiredCue] = useState(initialCue);
  const cueId = cue?.id;
  useEffect(() => {
    if (!cueId || cueId === initialCue) return;
    const timer = setTimeout(() => setExpiredCue(cueId), 2600);
    return () => clearTimeout(timer);
  }, [cueId, initialCue]);
  const fresh = cue && cue.id !== initialCue && cue.id !== expiredCue ? cue : undefined;
  return <div className="listener-avatar" data-person={person} data-online={online} data-quiet={quiet}>
    <span className="listener-avatar-face" key={fresh?.id ?? "idle"} data-gesture={fresh?.kind}>
      {person === "self" ? <Headphones size={23} strokeWidth={1.7} aria-hidden="true" /> : <UserRound size={23} strokeWidth={1.7} aria-hidden="true" />}
      <i className="listener-avatar-dot" aria-hidden="true" />
      {fresh && <span className="listener-avatar-gesture" aria-hidden="true"><InteractionGlyph kind={fresh.kind} /></span>}
    </span>
    <strong>{person === "self" ? "你" : "TA"}</strong><small>{online ? "一起听" : "未连接"}</small>
  </div>;
}

export function ListeningArtwork({ track, mode, role, outgoing, incoming, selfOnline = true, peerOnline = true, quiet = false }: Props) {
  const sent = outgoing?.trackId === track.id && outgoing.status !== "failed" && selfOnline ? outgoing : undefined;
  const received = mode === "online" ? role && incoming?.trackId === track.id && incoming.from !== role && peerOnline ? incoming : undefined : sent?.status === "received" ? { id: `${sent.id}:reply`, kind: sent.kind } : undefined;
  return <div className="listening-artwork" aria-label={`共听听众 ${Number(selfOnline) + Number(peerOnline)} / 2`}>
    <ListenerAvatar person="self" online={selfOnline} cue={sent} quiet={quiet} />
    <div className="listening-portrait"><span className="listening-portrait-orbit" aria-hidden="true" /><AlbumTile coverUrl={track.coverUrl} accent={track.accent} size="lg" /></div>
    <ListenerAvatar person="peer" online={peerOnline} cue={received} quiet={quiet} />
  </div>;
}
