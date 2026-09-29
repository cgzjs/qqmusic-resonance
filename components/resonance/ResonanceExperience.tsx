"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Compass, Footprints } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { InteractionGlyph } from "@/components/resonance/ReactionDock";
import { MockHostPanel } from "@/components/resonance/HostStatus";
import { JourneySummary, type JourneyTab } from "@/components/resonance/JourneySummary";
import { NearbyRadar } from "@/components/resonance/OnlineNearbyPanel";
import { DemoRoomSession } from "@/components/resonance/DemoRoomSession";
import { useResonanceWebTools } from "@/hooks/useResonanceWebTools";
import { useResonancePlayer, type ResonancePlayer } from "@/hooks/useResonancePlayer";
import { useAccountLibrary } from "@/hooks/useAccountLibrary";
import { useDemoReplies } from "@/hooks/useDemoReplies";
import { audioTracks, playableListeners } from "@/lib/resonance/demo-data";
import type { DemoReply } from "@/lib/resonance/demo-reply";
import type { NearbyPeer } from "@/lib/resonance/nearby-protocol";
import type { AppView, AudioTrack, JourneyEvent } from "@/lib/resonance/types";

// 模拟听众和真实附近的人长得一样：一个匿名代号，加上 TA 正在听的歌。
const demoPeers: NearbyPeer[] = playableListeners.flatMap((listener, index) => listener.audioTrackId
  ? [{ id: listener.id, alias: `听众 ${(0x3a7 + index * 0x1d3).toString(16).padStart(4, "0").slice(-4).toUpperCase()}`, trackId: listener.audioTrackId }]
  : []);

// 模拟听众的回应：喜欢你喜欢的歌，或旧数据里还没提醒过的回歌。
function showReplyToast(reply: DemoReply, ids?: Set<string | number>) {
  const exchange = reply.kind === "exchange";
  const track = audioTracks.find(item => item.id === (exchange ? reply.event?.receivedTrackId : reply.trackId));
  const id = `demo-reply-${reply.id}`;
  ids?.add(id);
  toast(exchange ? "收到一首歌" : "TA 也喜欢这首歌", {
    id, description: exchange ? track ? `《${track.track}》已存进足迹` : "已存进足迹" : track?.track ?? "刚才那首歌",
    icon: <InteractionGlyph kind={exchange ? "exchange" : "heart"} />,
    onDismiss: () => ids?.delete(id), onAutoClose: () => ids?.delete(id),
  });
}

type ExperienceProps = { roomView?: ((player: ResonancePlayer) => ReactNode) | null; playbackHeader?: (player: ResonancePlayer) => ReactNode; onTrackChange?: (trackId: string) => void; onlinePanel: ReactNode | ((player: ResonancePlayer) => ReactNode); onlineActive: boolean; onPauseOnline: () => void; initialSource: "demo" | "online" };
export function ResonanceExperience(props: ExperienceProps) {
  return playableListeners.length ? <PopulatedExperience {...props} /> : <EmptyPlaylistExperience />;
}
function EmptyPlaylistExperience() {
  const { library, dispatch, onlineHistory, onlineExchanges, received, markExchangeRead } = useAccountLibrary();
  const notices = useRef(new Set<string | number>());
  useEffect(() => () => { for (const id of notices.current) toast.dismiss(id); }, []);
  useDemoReplies(reply => showReplyToast(reply, notices.current));
  return <section className="empty-playlist"><h2>歌单还没有歌曲</h2><p>添加歌曲后即可开始，收藏和足迹仍在</p><JourneySummary received={received} onReadExchange={markExchangeRead} accountBacked library={library} onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} onPlayTrack={() => {}} onRemoveFavorite={trackId => void dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => void dispatch({ type: "removeLater", trackId })} /><MockHostPanel /><Toaster position="bottom-right" closeButton duration={8000} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} /></section>;
}
function PopulatedExperience({ roomView, playbackHeader, onTrackChange, onlinePanel, onlineActive, onPauseOnline, initialSource }: ExperienceProps) {
  const { library, dispatch, onlineHistory, onlineExchanges, received, markExchangeRead, unreadCount } = useAccountLibrary();
  const [view, setView] = useState<AppView>("radar");
  const [journeyTab, setJourneyTab] = useState<JourneyTab>("history");
  const [radarSource, setRadarSource] = useState<"demo" | "online">(initialSource);
  const [visible, setVisible] = useState(true);
  const [demoPeer, setDemoPeer] = useState<NearbyPeer | null>(null);
  const replyToasts = useRef(new Set<string | number>());
  const contentRef = useRef<HTMLDivElement>(null);
  const recordedTrack = useRef<string | null>(null);
  const { audioRef, player } = useResonancePlayer();
  useEffect(() => () => { for (const id of replyToasts.current) toast.dismiss(id); replyToasts.current.clear(); }, []);
  const { reaction, sendReaction } = useDemoReplies(reply => showReplyToast(reply, replyToasts.current));

  const inRoom = !!roomView;
  // 在点击里直接开播，保住浏览器的播放许可；和真人一样，跟上后就进一起听。
  function followDemo(peer: NearbyPeer) {
    const track = audioTracks.find(item => item.id === peer.trackId);
    if (inRoom || !track?.available) return false;
    onTrackChange?.(track.id);
    void player.playTrack(track);
    setRadarSource("demo"); setView("radar"); setDemoPeer(peer);
    return true;
  }
  function playSavedTrack(track: AudioTrack) {
    onTrackChange?.(track.id);
    void player.playTrack(track);
  }
  // 送 TA 一首是单向的：记一条只有送出歌曲的足迹，不再等回歌。
  const giftDemo = useCallback(async (peer: NearbyPeer, trackId: string) => {
    const event: JourneyEvent = { id: crypto.randomUUID(), type: "exchange", listenerId: peer.id, trackId, scene: "metro", createdAt: new Date().toISOString() };
    return await dispatch({ type: "event", event }) ? event.id : null;
  }, [dispatch]);

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [view, radarSource, inRoom, demoPeer]);
  // 一起听由房间自己记足迹；这里只记在附近页或足迹里自己点开的歌，每首连续播放记一次。
  useEffect(() => {
    if (player.status === "ended" || player.status === "idle") { recordedTrack.current = null; return; }
    if (inRoom || demoPeer || player.status !== "playing" || !player.track || recordedTrack.current === player.track.id) return;
    const listener = playableListeners.find(item => item.audioTrackId === player.track?.id);
    if (!listener) return;
    recordedTrack.current = player.track.id;
    dispatch({ type: "event", event: { id: crypto.randomUUID(), type: "listen", listenerId: listener.id, trackId: player.track.id, scene: "metro", createdAt: new Date().toISOString() } });
  }, [inRoom, demoPeer, player.status, player.track, dispatch]);

  useResonanceWebTools({
    followListener: listenerId => { const peer = demoPeers.find(item => item.id === listenerId); return !!peer && followDemo(peer); },
    openJourney: () => { if (inRoom || demoPeer) return false; setJourneyTab("history"); setView("journey"); return true; },
  });
  const inSession = inRoom || !!demoPeer;

  return (
    <section className="integrated-experience">
      <audio ref={audioRef} preload="metadata" hidden />
      <section className="phone-stage" aria-label="同频音乐体验">
        {!inSession && <nav className="bottom-nav" aria-label="主要导航"><button type="button" data-active={view === "radar"} aria-current={view === "radar" ? "page" : undefined} onClick={() => setView("radar")}><Compass aria-hidden="true" /><span>附近</span></button><button type="button" data-active={view === "journey"} aria-current={view === "journey" ? "page" : undefined} aria-label={unreadCount ? `足迹与收藏，${unreadCount} 首送你的歌未读` : "足迹与收藏"} onClick={() => { setJourneyTab("history"); setView("journey"); }}><Footprints aria-hidden="true" /><span>足迹与收藏{unreadCount > 0 && <b className="unread-count" aria-hidden="true">{unreadCount}</b>}</span></button></nav>}
        {!inSession && onlineActive && !(view === "radar" && radarSource === "online") && <div className="integrated-presence"><span>你正对附近可见</span><button type="button" onClick={onPauseOnline}>隐身</button></div>}
        <div className="phone-stage__content" ref={contentRef}>
          {roomView?.(player)}
          {!inRoom && demoPeer && <DemoRoomSession key={demoPeer.id} peer={demoPeer} player={player} onExit={() => { setDemoPeer(null); setView("radar"); }} onTrack={onTrackChange} reaction={reaction} onReact={(kind, trackId) => void sendReaction(kind, trackId)} onGift={trackId => giftDemo(demoPeer, trackId)} />}
          {!inSession && <>
          {view === "radar" && radarSource === "online" && (typeof onlinePanel === "function" ? onlinePanel(player) : onlinePanel)}
          {view === "radar" && radarSource === "demo" && <NearbyRadar peers={visible ? demoPeers : []} visible={visible} ready online busy={false} currentTrackId={player.track?.id ?? audioTracks[0]?.id ?? null} player={player} switchDisabled={false} onVisibleChange={() => setVisible(value => !value)} onFollow={peer => void followDemo(peer)} />}
          {view === "journey" && <JourneySummary key={journeyTab} initialTab={journeyTab} onTabChange={setJourneyTab} received={received} onReadExchange={markExchangeRead} accountBacked onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} library={library} onPlayTrack={playSavedTrack} onRemoveFavorite={trackId => dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => dispatch({ type: "removeLater", trackId })} onReturn={() => setView("radar")} />}
          </>}
        </div>
      </section>
      {!demoPeer && playbackHeader?.(player)}
      <MockHostPanel><label>听众来源<select aria-label="调试听众来源" value={radarSource} onChange={event => { setRadarSource(event.target.value as "demo" | "online"); setView("radar"); }}><option value="demo">模拟听众 · 自动回应</option><option value="online">真实客户端 · 双人联调</option></select></label></MockHostPanel>
      <Toaster position="bottom-right" containerAriaLabel="回应通知" closeButton duration={8000} visibleToasts={2} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} />
    </section>
  );
}
