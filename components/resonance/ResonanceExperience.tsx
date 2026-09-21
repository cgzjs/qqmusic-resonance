"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compass, Footprints, Radio } from "lucide-react";
import { JourneySummary } from "@/components/resonance/JourneySummary";
import { ListeningSession } from "@/components/resonance/ListeningSession";
import { MatchDetail } from "@/components/resonance/MatchDetail";
import { RadarHome } from "@/components/resonance/RadarHome";
import { SongExchange } from "@/components/resonance/SongExchange";
import { MiniPlayer } from "@/components/resonance/MiniPlayer";
import { useResonanceWebTools } from "@/hooks/useResonanceWebTools";
import { useResonancePlayer } from "@/hooks/useResonancePlayer";
import { useAccountLibrary } from "@/hooks/useAccountLibrary";
import { audioTracks, playableListeners, sceneDistanceLabels, sceneListenerIds } from "@/lib/resonance/demo-data";
import { pickReceivedTrack } from "@/lib/resonance/library";
import type { AppView, AudioTrack, ExchangeStatus, JourneyEvent, NearbyListener, SceneId } from "@/lib/resonance/types";

type ExchangeDraft = {
  id: string;
  listener: NearbyListener;
  source: "match" | "listening";
  scene: SceneId;
  selectedId: string;
  receivedId: string | null;
  status: ExchangeStatus;
};

type ExperienceProps = { onlinePanel: ReactNode; onlineNotice: string | null; onlineActive: boolean; onPauseOnline: () => void; initialSource: "demo" | "online" };
export function ResonanceExperience(props: ExperienceProps) {
  return playableListeners.length ? <PopulatedExperience {...props} /> : <EmptyPlaylistExperience />;
}
function EmptyPlaylistExperience() {
  const { library, dispatch, onlineHistory, onlineExchanges } = useAccountLibrary();
  return <section className="empty-playlist"><h2>歌单还没有歌曲</h2><p>添加歌曲后即可开始同频；已有收藏和记录仍然保留。</p><JourneySummary accountBacked library={library} onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} onPlayTrack={() => {}} onRemoveFavorite={trackId => void dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => void dispatch({ type: "removeLater", trackId })} /></section>;
}
function PopulatedExperience({ onlinePanel, onlineNotice, onlineActive, onPauseOnline, initialSource }: ExperienceProps) {
  const [view, setView] = useState<AppView>("radar");
  const [radarSource, setRadarSource] = useState<"demo" | "online">(initialSource);
  const [isSavingExchange, setIsSavingExchange] = useState(false);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [scene, setScene] = useState<SceneId>("metro");
  const [selectedId, setSelectedId] = useState(playableListeners[0].id);
  const [playbackListener, setPlaybackListener] = useState(playableListeners[0]);
  const [listeningSource, setListeningSource] = useState<"match" | "journey">("match");
  const [scanRound, setScanRound] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [exchange, setExchange] = useState<ExchangeDraft | null>(null);
  const [reaction, setReaction] = useState<"wave" | "heart" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listeningAttempt = useRef<{ id: string; listenerId: string; trackId: string; scene: SceneId } | null>(null);
  const recordedAttempt = useRef<string | null>(null);
  const { audioRef, player } = useResonancePlayer();
  const { library, dispatch, onlineHistory, onlineExchanges } = useAccountLibrary();
  const latestExchange = useRef(exchange);
  useEffect(() => { latestExchange.current = exchange; }, [exchange]);
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
    setPlaybackListener(listener); setListeningSource(source); setReaction(null); setView("listening");
    void player.playTrack(track);
  }
  function playSavedTrack(track: AudioTrack) {
    const listener = playableListeners.find(item => item.audioTrackId === track.id) ?? playableListeners[0];
    void startListening(listener, track, "journey");
  }
  function openExchange(source: "match" | "listening") {
    const listener = source === "listening" ? playbackListener : selectedListener;
    if (!listener.suggestions.length) return;
    setExchange({ id: crypto.randomUUID(), listener, source, scene, selectedId: listener.suggestions[0].id, receivedId: null, status: "choosing" });
    setView("exchange");
  }
  function sendExchange() {
    if (!exchange || exchange.status !== "choosing") return;
    const receivedId = pickReceivedTrack(exchange.selectedId, audioTracks.map(track => track.id), library.events.filter(event => event.type === "exchange").length);
    if (receivedId) setExchange({ ...exchange, receivedId, status: "sending" });
  }
  async function finishExchange(destination: "favorite" | "later") {
    if (!exchange?.receivedId || exchange.status !== "received") return;
    setIsSavingExchange(true);
    const saved = await dispatch({ type: destination, trackId: exchange.receivedId });
    setIsSavingExchange(false);
    if (saved && latestExchange.current?.id === exchange.id) { setExchange(null); setView("journey"); }
  }
  function backFromExchange() {
    if (!exchange) return;
    setSelectedId(exchange.listener.id);
    setView(exchange.source === "listening" && player.track ? "listening" : "match");
    setExchange(null);
  }
  function changeScene(next: SceneId) {
    setScene(next); setScanRound(0); setIsScanning(false); setSelectedId(sceneListenerIds[next][0]);
  }

  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [view, radarSource]);
  useEffect(() => {
    const attempt = listeningAttempt.current;
    if (player.status !== "playing" || !attempt || attempt.trackId !== player.track?.id || recordedAttempt.current === attempt.id) return;
    recordedAttempt.current = attempt.id;
    dispatch({ type: "event", event: { ...attempt, type: "listen", createdAt: new Date().toISOString() } });
  }, [player.status, player.track?.id, dispatch]);
  useEffect(() => {
    if (!isScanning) return;
    const timer = window.setTimeout(() => setIsScanning(false), 650);
    return () => window.clearTimeout(timer);
  }, [isScanning, scene, scanRound]);
  useEffect(() => {
    if (view !== "exchange" || exchange?.status !== "sending" || !exchange.receivedId) return;
    const timer = window.setTimeout(async () => {
      const saved = await dispatch({ type: "event", event: { id: exchange.id, type: "exchange", listenerId: exchange.listener.id, trackId: exchange.selectedId, receivedTrackId: exchange.receivedId!, scene: exchange.scene, createdAt: new Date().toISOString() } });
      setExchange(current => current?.id === exchange.id ? { ...current, status: saved ? "received" : "choosing" } : current);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [exchange, view, dispatch]);

  useResonanceWebTools({ selectListener: listener => openMatch(listener), setView });
  const showNavigation = view === "radar" || view === "journey";
  function openOnline() { setExchange(null); setView("radar"); setRadarSource("online"); }

  return (
    <section className="integrated-experience">
      <audio ref={audioRef} preload="metadata" hidden />
      <section className="phone-stage" aria-label="同频音乐体验">
        {onlineNotice && <button type="button" className="integrated-invite-notice" aria-label={onlineNotice} onClick={openOnline}><Radio size={16} aria-hidden="true" /><span role="status">{onlineNotice}</span><span>查看 →</span></button>}
        {onlineActive && <div className="integrated-presence"><span>在线发现已开启</span><button type="button" onClick={onPauseOnline}>暂停在线发现</button></div>}
        {view === "radar" && <nav className="radar-source-tabs" aria-label="雷达来源"><button aria-pressed={radarSource === "demo"} onClick={() => setRadarSource("demo")}>场景体验</button><button aria-pressed={radarSource === "online"} onClick={() => setRadarSource("online")}>在线听众</button></nav>}
        <div className="phone-stage__content" ref={contentRef}>
          {view === "radar" && radarSource === "online" && onlinePanel}
          {view === "radar" && radarSource === "demo" && <RadarHome onOpenOnline={openOnline} isDiscoverable={isDiscoverable} onDiscoverableChange={value => { setIsDiscoverable(value); setIsScanning(false); }} scene={scene} onSceneChange={changeScene} listeners={listeners} isScanning={isScanning} onRefresh={() => { setScanRound(round => round + 1); setIsScanning(true); }} selectedListener={selectedListener} onSelectListener={listener => setSelectedId(listener.id)} onOpenMatch={() => openMatch()} />}
          {view === "match" && <MatchDetail listener={selectedListener} onBack={() => setView("radar")} onListen={() => void startListening(selectedListener)} onExchange={() => openExchange("match")} />}
          {view === "listening" && player.track && <ListeningSession onOpenOnline={openOnline} player={player} reaction={reaction} onReact={setReaction} isFavorite={library.favoriteIds.includes(player.track.id)} onToggleFavorite={() => player.track && dispatch({ type: library.favoriteIds.includes(player.track.id) ? "removeFavorite" : "favorite", trackId: player.track.id })} onBack={() => { setSelectedId(playbackListener.id); setView(listeningSource); }} onExchange={() => openExchange("listening")} onEnd={() => { player.stop(); setView("radar"); }} />}
          {view === "exchange" && exchange && <SongExchange isSaving={isSavingExchange} listener={exchange.listener} selectedSongId={exchange.selectedId} status={exchange.status} receivedTrack={audioTracks.find(track => track.id === exchange.receivedId) ?? null} onSelectSong={id => setExchange({ ...exchange, selectedId: id })} onSend={sendExchange} onBack={backFromExchange} onSave={() => finishExchange("favorite")} onListenLater={() => finishExchange("later")} />}
          {view === "journey" && <JourneySummary accountBacked onlineHistory={onlineHistory} onlineExchanges={onlineExchanges} library={library} onPlayTrack={playSavedTrack} onRemoveFavorite={trackId => dispatch({ type: "removeFavorite", trackId })} onRemoveLater={trackId => dispatch({ type: "removeLater", trackId })} onReturn={() => setView("radar")} />}
        </div>
        {view !== "listening" && <MiniPlayer player={player} onOpen={() => setView("listening")} />}
        {showNavigation && <nav className="bottom-nav" aria-label="主要导航"><button type="button" data-active={view === "radar"} aria-current={view === "radar" ? "page" : undefined} onClick={() => setView("radar")}><Compass aria-hidden="true" /><span>雷达</span></button><button type="button" data-active={view === "journey"} aria-current={view === "journey" ? "page" : undefined} onClick={() => setView("journey")}><Footprints aria-hidden="true" /><span>足迹与收藏</span></button></nav>}
      </section>
    </section>
  );
}
