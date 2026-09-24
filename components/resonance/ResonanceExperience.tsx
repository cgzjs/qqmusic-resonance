"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compass, Footprints, Radio } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { InteractionGlyph } from "@/components/resonance/ReactionDock";
import { MockHostPanel } from "@/components/resonance/HostStatus";
import { JourneySummary, type JourneyTab } from "@/components/resonance/JourneySummary";
import { ListeningSession } from "@/components/resonance/ListeningSession";
import { MatchDetail } from "@/components/resonance/MatchDetail";
import { RadarHome } from "@/components/resonance/RadarHome";
import { SongExchange } from "@/components/resonance/SongExchange";
import { MiniPlayer } from "@/components/resonance/MiniPlayer";
import { useResonanceWebTools } from "@/hooks/useResonanceWebTools";
import { useResonancePlayer, type ResonancePlayer } from "@/hooks/useResonancePlayer";
import { useAccountLibrary } from "@/hooks/useAccountLibrary";
import { useDemoReplies } from "@/hooks/useDemoReplies";
import { useIncomingInviteNotification } from "@/hooks/useOnlineNotifications";
import type { NearbyInvite } from "@/lib/resonance/nearby-protocol";
import { audioTracks, playableListeners, sceneDistanceLabels, sceneListenerIds } from "@/lib/resonance/demo-data";
import { pickReceivedTrack } from "@/lib/resonance/library";
import type { DemoReply } from "@/lib/resonance/demo-reply";
import type { AppView, AudioTrack, ExchangeStatus, JourneyEvent, NearbyListener, SceneId } from "@/lib/resonance/types";

type ExchangeDraft = {
  id: string;
  listener: NearbyListener;
  source: "match" | "listening";
  scene: SceneId;
  selectedId: string;
  receivedId: string | null;
  status: ExchangeStatus;
  queuedEvent?: JourneyEvent;
};

function restoreExchange(item?: DemoReply): ExchangeDraft | null {
  const event = item?.event;
  const listener = playableListeners.find(listener => listener.id === event?.listenerId);
  if (!event || !listener) return null;
  return { id: item!.id, listener, source: "match", scene: event.scene, selectedId: event.trackId, receivedId: event.receivedTrackId ?? null, status: item!.status === "pending" ? "sending" : "received", queuedEvent: event };
}

type ExperienceProps = { playbackHeader?: (player: ResonancePlayer) => ReactNode; onTrackChange?: (trackId: string) => void; onlinePanel: ReactNode | ((player: ResonancePlayer) => ReactNode); onlineNotice: string | null; incomingInvite?: NearbyInvite | null; onlineActive: boolean; onPauseOnline: () => void; initialSource: "demo" | "online" };
export function ResonanceExperience(props: ExperienceProps) {
  return playableListeners.length ? <PopulatedExperience {...props} /> : <EmptyPlaylistExperience />;
}
function EmptyPlaylistExperience() {
  const { library, dispatch, onlineHistory, onlineExchanges, received, markExchangeRead, unreadCount } = useAccountLibrary();
  const notices = useRef(new Set<string>());
  useEffect(() => () => { for (const id of notices.current) toast.dismiss(id); }, []);
  useDemoReplies(reply => {
    const id = `demo-reply-${reply.id}`; notices.current.add(id);
    toast(reply.kind === "exchange" ? "TA 回了你一首歌" : "TA 回应了你", { id, description: reply.kind === "exchange" ? "交换记录已留在收到的歌里" : "来自刚才那首歌的相遇" });
  });
  return <section className="empty-playlist"><h2>歌单还没有歌曲</h2><p>添加歌曲后即可开始同频；已有收藏和记录仍然保留。</p><JourneySummary initialTab={unreadCount ? "received" : "history"} received={received} onReadExchange={markExchangeRead} accountBacked library={library} onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} onPlayTrack={() => {}} onRemoveFavorite={trackId => void dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => void dispatch({ type: "removeLater", trackId })} /><MockHostPanel /><Toaster position="bottom-right" closeButton duration={8000} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} /></section>;
}
function PopulatedExperience({ playbackHeader, onTrackChange, onlinePanel, onlineNotice, incomingInvite, onlineActive, onPauseOnline, initialSource }: ExperienceProps) {
  const { library, dispatch, onlineHistory, onlineExchanges, received, markExchangeRead, unreadCount, queueExchange, demoReplies } = useAccountLibrary();
  const [view, setView] = useState<AppView>("radar");
  const [journeyTab, setJourneyTab] = useState<JourneyTab>("history");
  const [radarSource, setRadarSource] = useState<"demo" | "online">(initialSource);
  const [isSavingExchange, setIsSavingExchange] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [scene, setScene] = useState<SceneId>("metro");
  const [selectedId, setSelectedId] = useState(playableListeners[0].id);
  const [playbackListener, setPlaybackListener] = useState(playableListeners[0]);
  const [listeningSource, setListeningSource] = useState<"match" | "journey">("match");
  const [scanRound, setScanRound] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [exchange, setExchange] = useState<ExchangeDraft | null>(() => restoreExchange(demoReplies.find(item => item.kind === "exchange" && !item.notified)));
  const replyToasts = useRef(new Set<string | number>());
  const contentRef = useRef<HTMLDivElement>(null);
  const listeningAttempt = useRef<{ id: string; listenerId: string; trackId: string; scene: SceneId } | null>(null);
  const recordedAttempt = useRef<string | null>(null);
  const { audioRef, player } = useResonancePlayer();
  const latestExchange = useRef(exchange);
  useEffect(() => { latestExchange.current = exchange; }, [exchange]);
  useEffect(() => () => { for (const id of replyToasts.current) toast.dismiss(id); replyToasts.current.clear(); }, []);
  const { reaction, sendReaction } = useDemoReplies(reply => {
    if (reply.kind === "exchange") {
      const restored = restoreExchange(reply);
      setExchange(current => !current || current.id === reply.id ? restored : current);
      const id = `demo-exchange-${reply.id}`;
      replyToasts.current.add(id);
      const track = audioTracks.find(item => item.id === reply.event?.receivedTrackId);
      toast("TA 回了你一首歌", {
        id, description: track ? `《${track.track}》` : "可以在收到的歌里查看", icon: <InteractionGlyph kind="exchange" />,
        action: { label: "查看回歌", onClick: () => {
          void markExchangeRead(`demo:${reply.id}`);
          setJourneyTab("received"); setView(restored && (!latestExchange.current || latestExchange.current.id === reply.id) ? "exchange" : "journey");
        } },
        onDismiss: () => replyToasts.current.delete(id), onAutoClose: () => replyToasts.current.delete(id),
      });
      return;
    }
    const track = audioTracks.find(item => item.id === reply.trackId);
    const id = `demo-reaction-${reply.id}`;
    replyToasts.current.add(id);
    toast(reply.kind === "wave" ? "TA 也向你挥了挥手" : "TA 也喜欢这首歌", {
      id, description: `${track?.track ?? "刚才那首歌"}`, icon: <InteractionGlyph kind={reply.kind} />,
      action: { label: "查看歌曲", onClick: () => {
        const listener = playableListeners.find(item => item.audioTrackId === reply.trackId);
        if (listener) { setSelectedId(listener.id); setView("match"); }
      } },
      onDismiss: () => replyToasts.current.delete(id), onAutoClose: () => replyToasts.current.delete(id),
    });
  });
  const listeners = useMemo(() => {
    if (scanRound % 3 === 1) return [];
    const pool = playableListeners.filter(listener => sceneListenerIds[scene].includes(listener.id));
    const offset = pool.length ? scanRound % pool.length : 0;
    return [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, 4).map((listener, index) => ({ ...listener, position: [{ x: 66, y: 30 }, { x: 23, y: 47 }, { x: 71, y: 72 }, { x: 36, y: 78 }][index], distanceLabel: sceneDistanceLabels[scene] }));
  }, [scene, scanRound]);
  const selected = view === "radar"
    ? listeners.find(listener => listener.id === selectedId) ?? listeners[0] ?? playableListeners[0]
    : playableListeners.find(listener => listener.id === selectedId) ?? playableListeners[0];
  const selectedListener = { ...selected, distanceLabel: sceneDistanceLabels[scene] };

  function recordEvent(type: JourneyEvent["type"], listener: NearbyListener, trackId: string) {
    dispatch({ type: "event", event: { id: crypto.randomUUID(), type, listenerId: listener.id, trackId, scene, createdAt: new Date().toISOString() } });
  }
  function openMatch(listener = selectedListener) {
    setSelectedId(listener.id); setView("match");
    if (listener.audioTrackId) recordEvent("discover", listener, listener.audioTrackId);
  }
  function startListening(listener: NearbyListener, track = audioTracks.find(item => item.id === listener.audioTrackId), source: "match" | "journey" = "match") {
    if (!track?.available) return;
    if (!listeningAttempt.current || player.track?.id !== track.id || player.status === "ended" || player.status === "idle") {
      listeningAttempt.current = { id: crypto.randomUUID(), listenerId: listener.id, trackId: track.id, scene };
    }
    onTrackChange?.(track.id);
    setPlaybackListener(listener); setListeningSource(source); setView("listening");
    void player.playTrack(track);
  }
  function playSavedTrack(track: AudioTrack) {
    const listener = playableListeners.find(item => item.audioTrackId === track.id) ?? playableListeners[0];
    void startListening(listener, track, "journey");
  }
  function openExchange(source: "match" | "listening") {
    if (exchange?.status === "sending") { setView("exchange"); return; }
    const listener = source === "listening" ? playableListeners.find(item => item.audioTrackId === player.track?.id) ?? playbackListener : selectedListener;
    if (!listener.suggestions.length) return;
    setExchange({ id: crypto.randomUUID(), listener, source, scene, selectedId: listener.suggestions[0].id, receivedId: null, status: "choosing" });
    setView("exchange");
  }
  async function sendExchange() {
    if (!exchange || exchange.status !== "choosing") return;
    const receivedId = pickReceivedTrack(exchange.selectedId, audioTracks.map(track => track.id), library.events.filter(event => event.type === "exchange").length);
    if (!receivedId) return;
    const event = exchange.queuedEvent ?? { id: exchange.id, type: "exchange" as const, listenerId: exchange.listener.id, trackId: exchange.selectedId, receivedTrackId: receivedId, scene: exchange.scene, createdAt: new Date().toISOString() };
    setExchange({ ...exchange, receivedId: event.receivedTrackId!, status: "sending", queuedEvent: event });
    const saved = await queueExchange(event);
    if (!saved) {
      setExchange(current => current?.id === event.id ? { ...current, status: "choosing" } : current);
      const id = `demo-exchange-error-${event.id}`; replyToasts.current.add(id);
      toast("暂未确认送出，请重试", { id, description: "恢复连接后会核对这次请求", action: { label: "查看", onClick: () => setView("exchange") } });
    }
  }
  async function finishExchange(destination: "favorite" | "later") {
    if (!exchange?.receivedId || exchange.status !== "received") return;
    setIsSavingExchange(true);
    const saved = await dispatch({ type: destination, trackId: exchange.receivedId });
    setIsSavingExchange(false);
    if (saved && latestExchange.current?.id === exchange.id) { void markExchangeRead(`demo:${exchange.id}`); toast.dismiss(`demo-exchange-${exchange.id}`); setExchange(null); setView("journey"); }
  }
  function viewExchange() {
    if (exchange?.status === "received") void markExchangeRead(`demo:${exchange.id}`);
    if (exchange) toast.dismiss(`demo-exchange-${exchange.id}`);
    setView("exchange");
  }
  function backFromExchange() {
    if (!exchange) return;
    setSelectedId(exchange.listener.id);
    setView(exchange.source === "listening" && player.track ? "listening" : "match");
    if (exchange.status === "choosing") setExchange(null);
  }
  function changeScene(next: SceneId) {
    setScene(next); setScanRound(0); setIsScanning(false); setSelectedId(sceneListenerIds[next][0]);
  }

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [view, radarSource]);
  useEffect(() => {
    if (player.status !== "playing" || !player.track) return;
    let attempt = listeningAttempt.current;
    if (!attempt || attempt.trackId !== player.track.id) {
      const listener = playableListeners.find(item => item.audioTrackId === player.track?.id);
      if (!listener) return;
      attempt = { id: crypto.randomUUID(), listenerId: listener.id, trackId: player.track.id, scene };
      listeningAttempt.current = attempt;
    }
    if (recordedAttempt.current === attempt.id) return;
    recordedAttempt.current = attempt.id;
    dispatch({ type: "event", event: { ...attempt, type: "listen", createdAt: new Date().toISOString() } });
  }, [player.status, player.track, dispatch, scene]);
  useEffect(() => {
    if (!isScanning) return;
    const timer = window.setTimeout(() => setIsScanning(false), 650);
    return () => window.clearTimeout(timer);
  }, [isScanning, scene, scanRound]);


  useResonanceWebTools({ selectListener: listener => openMatch(listener), setView });
  const showNavigation = view === "radar" || view === "journey";
  function openOnline() { setView("radar"); setRadarSource("online"); }
  useIncomingInviteNotification(incomingInvite, openOnline);

  return (
    <section className="integrated-experience">
      <audio ref={audioRef} preload="metadata" hidden />
      <section className="phone-stage" aria-label="同频音乐体验">
        {showNavigation && <nav className="bottom-nav" aria-label="主要导航"><button type="button" data-active={view === "radar"} aria-current={view === "radar" ? "page" : undefined} onClick={() => setView("radar")}><Compass aria-hidden="true" /><span>附近</span></button><button type="button" data-active={view === "journey"} aria-current={view === "journey" ? "page" : undefined} aria-label={unreadCount ? `足迹与收藏，${unreadCount} 首回歌未读` : "足迹与收藏"} onClick={() => { setJourneyTab(unreadCount ? "received" : "history"); setView("journey"); }}><Footprints aria-hidden="true" /><span>足迹与收藏{unreadCount > 0 && <b className="unread-count" aria-hidden="true">{unreadCount}</b>}</span></button></nav>}
        {onlineNotice && <button type="button" className="integrated-invite-notice" aria-label={onlineNotice} onClick={openOnline}><Radio size={16} aria-hidden="true" /><span role="status">{onlineNotice}</span><span>查看 →</span></button>}
        {onlineActive && !(view === "radar" && radarSource === "online") && <div className="integrated-presence"><span>真人联调发现已开启</span><button type="button" onClick={onPauseOnline}>暂停在线发现</button></div>}
        {exchange && exchange.status !== "choosing" && view !== "exchange" && <button type="button" className="demo-reply-reminder" onClick={viewExchange}><InteractionGlyph kind="exchange" /><span>{exchange.status === "sending" ? "等待 TA 回歌" : "TA 回了一首歌"}</span><span>查看 →</span></button>}
        <div className="phone-stage__content" ref={contentRef}>
          {view === "radar" && radarSource === "online" && (typeof onlinePanel === "function" ? onlinePanel(player) : onlinePanel)}
          {view === "radar" && radarSource === "demo" && <RadarHome isDiscoverable={isDiscoverable} onDiscoverableChange={value => { setIsDiscoverable(value); setIsScanning(false); }} scene={scene} onSceneChange={changeScene} listeners={listeners} isScanning={isScanning} onRefresh={() => { setScanRound(round => round + 1); setIsScanning(true); }} selectedListener={selectedListener} onSelectListener={listener => setSelectedId(listener.id)} onOpenMatch={() => openMatch()} />}
          {view === "match" && <MatchDetail listener={selectedListener} onBack={() => setView("radar")} onListen={() => void startListening(selectedListener)} onExchange={() => openExchange("match")} />}
          {view === "listening" && player.track && <ListeningSession player={player} reaction={reaction} onReact={kind => { if (player.track) sendReaction(kind, player.track.id); }} isFavorite={library.favoriteIds.includes(player.track.id)} onToggleFavorite={() => player.track && dispatch({ type: library.favoriteIds.includes(player.track.id) ? "removeFavorite" : "favorite", trackId: player.track.id })} onBack={() => { setSelectedId(playbackListener.id); setView(listeningSource); }} onExchange={() => openExchange("listening")} onEnd={() => { player.stop(); setView("radar"); }} />}
          {view === "exchange" && exchange && <SongExchange isSaving={isSavingExchange} listener={exchange.listener} selectedSongId={exchange.selectedId} status={exchange.status} receivedTrack={audioTracks.find(track => track.id === exchange.receivedId) ?? null} onSelectSong={id => setExchange({ ...exchange, id: crypto.randomUUID(), selectedId: id, queuedEvent: undefined })} onSend={sendExchange} onBack={backFromExchange} onBrowse={() => { setView("radar"); setRadarSource("demo"); }} onSave={() => finishExchange("favorite")} onListenLater={() => finishExchange("later")} />}
          {view === "journey" && <JourneySummary key={journeyTab} initialTab={journeyTab} onTabChange={setJourneyTab} received={received} onReadExchange={markExchangeRead} accountBacked onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} library={library} onPlayTrack={playSavedTrack} onRemoveFavorite={trackId => dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => dispatch({ type: "removeLater", trackId })} onReturn={() => setView("radar")} />}
        </div>
        {!playbackHeader && view !== "listening" && <MiniPlayer player={player} onOpen={() => setView("listening")} />}
      </section>
      {playbackHeader?.(player)}
      <MockHostPanel><label>听众来源<select aria-label="调试听众来源" value={radarSource} onChange={event => { setRadarSource(event.target.value as "demo" | "online"); setView("radar"); }}><option value="demo">模拟听众 · 自动回应</option><option value="online">真实客户端 · 双人联调</option></select></label></MockHostPanel>
      <Toaster position="bottom-right" containerAriaLabel="回应通知" closeButton duration={8000} visibleToasts={2} toastOptions={{ className: "demo-reply-toast", closeButtonAriaLabel: "关闭回应提示" }} />
    </section>
  );
}
