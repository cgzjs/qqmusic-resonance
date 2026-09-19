"use client";

import { useState } from "react";
import { Compass, Footprints, ShieldCheck } from "lucide-react";

import { JourneySummary } from "@/components/resonance/JourneySummary";
import { ListeningSession } from "@/components/resonance/ListeningSession";
import { MatchDetail } from "@/components/resonance/MatchDetail";
import { RadarHome } from "@/components/resonance/RadarHome";
import { SongExchange } from "@/components/resonance/SongExchange";
import { useResonanceWebTools } from "@/hooks/useResonanceWebTools";
import { nearbyListeners } from "@/lib/resonance/demo-data";
import type { AppView, NearbyListener, SceneId } from "@/lib/resonance/types";

export function ResonanceExperience() {
  const [view, setView] = useState<AppView>("radar");
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [scene, setScene] = useState<SceneId>("metro");
  const [selectedListener, setSelectedListener] = useState<NearbyListener>(nearbyListeners[0]);

  useResonanceWebTools({ selectListener: setSelectedListener, setView });

  const showNavigation = view === "radar" || view === "journey";

  return (
    <main className="experience-page">
      <div className="ambient-orb ambient-orb--one" />
      <div className="ambient-orb ambient-orb--two" />

      <aside className="story-panel story-panel--left" aria-label="产品介绍">
        <p>QQ MUSIC · EXPERIMENT 01</p>
        <h2>和附近的人，<br />短暂听进彼此的世界。</h2>
        <span>不认识，不打扰。只让正在播放的歌，成为你们共同的三分钟。</span>
        <div className="story-rule" />
        <small>匿名音乐相遇 · 通勤场景概念原型</small>
      </aside>

      <section className="phone-stage" aria-label="同频音乐体验">
        <div className="phone-stage__content">
          {view === "radar" && (
            <RadarHome
              isDiscoverable={isDiscoverable}
              onDiscoverableChange={setIsDiscoverable}
              scene={scene}
              onSceneChange={setScene}
              selectedListener={selectedListener}
              onSelectListener={setSelectedListener}
              onOpenMatch={() => setView("match")}
            />
          )}
          {view === "match" && (
            <MatchDetail
              listener={selectedListener}
              onBack={() => setView("radar")}
              onListen={() => setView("listening")}
              onExchange={() => setView("exchange")}
            />
          )}
          {view === "listening" && (
            <ListeningSession
              listener={selectedListener}
              onBack={() => setView("match")}
              onExchange={() => setView("exchange")}
            />
          )}
          {view === "exchange" && (
            <SongExchange
              listener={selectedListener}
              onBack={() => setView("listening")}
              onComplete={() => setView("journey")}
            />
          )}
          {view === "journey" && <JourneySummary onReturn={() => setView("radar")} />}
        </div>

        {showNavigation && (
          <nav className="bottom-nav" aria-label="主要导航">
            <button type="button" data-active={view === "radar"} onClick={() => setView("radar")}>
              <Compass aria-hidden="true" /><span>雷达</span>
            </button>
            <button type="button" data-active={view === "journey"} onClick={() => setView("journey")}>
              <Footprints aria-hidden="true" /><span>足迹</span>
            </button>
            <div className="privacy-pill"><ShieldCheck aria-hidden="true" /><span>匿名模式</span></div>
          </nav>
        )}
      </section>

      <aside className="story-panel story-panel--right" aria-label="隐私原则">
        <span className="privacy-icon"><ShieldCheck aria-hidden="true" /></span>
        <h3>只交换音乐，<br />不交换位置。</h3>
        <ul>
          <li>不展示头像与真实身份</li>
          <li>不显示精确距离和方向</li>
          <li>双方有回应后才会再次遇见</li>
        </ul>
        <small>非官方 QQ 音乐概念设计</small>
      </aside>
    </main>
  );
}
