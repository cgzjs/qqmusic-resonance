"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowLeft, ArrowRight, AudioLines, Crosshair, Headphones, Link2, Pause, Play } from "lucide-react";
import { coverWaveformPeaks, nearbyListeners } from "@/lib/resonance/demo-data";
import { OrbitalDecorations } from "@/components/resonance/OrbitalDecorations";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import "@/app/landing.css";
import { AppearanceToggle } from "./Appearance";

const chapters = [
  { name: "discover", label: "发现", icon: Crosshair },
  { name: "sync", label: "跟听", icon: Headphones },
  { name: "exchange", label: "交换", icon: ArrowDownUp },
];

const signal = nearbyListeners[0];
const bars = Array.from({ length: 48 }, (_, index) => Math.round(12 + Math.abs(Math.sin(index * .73) * Math.cos(index * .21)) * 78));
// Interpolate the illustrative envelope into fine, asymmetric audio samples.
// Integer arithmetic keeps server/client SVG attributes identical.
const waveformSamples = Array.from({ length: coverWaveformPeaks.length * 2 }, (_, index) => {
  const peakIndex = Math.floor(index / 2);
  const peak = index % 2 === 0 ? coverWaveformPeaks[peakIndex] : Math.round((coverWaveformPeaks[peakIndex] + coverWaveformPeaks[Math.min(peakIndex + 1, coverWaveformPeaks.length - 1)]) / 2);
  return {
    top: Math.max(3, Math.round(peak * (48 + (index * 37 % 47)) / 190)),
    bottom: Math.max(3, Math.round(peak * (42 + (index * 29 % 53)) / 215)),
  };
});

function Spectrum() {
  return <div className="terminal-spectrum" aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ "--bar-height": `${height}%`, "--bar-delay": `${(-(index % 9) * .17).toFixed(2)}s` } as CSSProperties} />)}</div>;
}

function WaveformBars({ played = false }: { played?: boolean }) {
  return (
    <svg className={`listening-waveform__bars${played ? " listening-waveform__bars--played" : ""}`} viewBox={`0 0 ${waveformSamples.length * 3} 100`} preserveAspectRatio="none" aria-hidden="true">
      {waveformSamples.map(({ top, bottom }, index) => <path key={index} d={`M${index * 3 + 1} ${50 - top}v${top + bottom}`} />)}
    </svg>
  );
}

/** Fixed waveform + advancing playhead, following WaveSurfer's bars example. */
function SharedWave() {
  return (
    <div className="signal-sync" role="img" aria-label="同步跟听：两位听众共享同一段波形与播放进度">
      <div className="signal-sync__people" aria-hidden="true"><span><Headphones size={15} />YOU</span><span className="signal-sync__connection"><Link2 size={16} /></span><span>TA<Headphones size={15} /></span></div>
      <div className="listening-waveform" aria-hidden="true">
        <span className="listening-waveform__baseline" />
        <WaveformBars />
        <WaveformBars played />
        <span className="listening-waveform__cursor"><i /></span>
      </div>
      <div className="signal-sync__ticks" aria-hidden="true">{Array.from({ length: 25 }, (_, index) => <i key={index} />)}</div>
    </div>
  );
}

function ExchangePreview() {
  const outgoing = signal.suggestions[0];
  const incoming = signal.suggestions[2];

  return (
    <div className="signal-exchange" aria-label="匿名交换歌曲示意">
      <article className="exchange-card exchange-card--outgoing">
        <span className="exchange-card__owner">YOU</span>
        <div className="exchange-card__sleeve"><span className="exchange-card__side" aria-hidden="true">A</span><AlbumTile accent="#6feee1" className="exchange-card__record" /><span className="exchange-card__grooves" aria-hidden="true" /></div>
        <h3>{outgoing.track}</h3><p>{outgoing.artist}</p>
      </article>
      <div className="exchange-route" aria-hidden="true"><ArrowRight className="exchange-route__out" size={22} /><ArrowLeft className="exchange-route__in" size={22} /></div>
      <article className="exchange-card exchange-card--incoming">
        <span className="exchange-card__owner">TA</span>
        <div className="exchange-card__sleeve"><span className="exchange-card__side" aria-hidden="true">B</span><AlbumTile accent="#a8bdd8" className="exchange-card__record" /><span className="exchange-card__grooves" aria-hidden="true" /></div>
        <h3>{incoming.track}</h3><p>{incoming.artist}</p>
      </article>
    </div>
  );
}

function SignalDisplay({ chapterIndex }: { chapterIndex: number }) {
  return (
    <section className="signal-console" data-mode={chapterIndex} aria-label={`${chapters[chapterIndex].label}预览`}>
      <div className="signal-display" data-mode={chapterIndex}>
        {chapterIndex === 0 && <div className="signal-radar" role="img" aria-label="音乐雷达示意：你与附近四位听众的音乐相遇">
          <svg viewBox="0 0 480 290" aria-hidden="true">
            <g className="signal-radar__grid"><path d="M240 12v266M45 145h390" /><circle cx="240" cy="145" r="45" /><circle cx="240" cy="145" r="88" /><circle cx="240" cy="145" r="130" /><path d="m145 50 190 190m0-190L145 240" strokeDasharray="2 7" /></g>
            <g className="signal-radar__sweep"><path d="M240 145 335 57" /><path d="M240 145 323 44" opacity=".4" /><path d="M240 145 309 34" opacity=".15" /></g>
            <g className="signal-radar__connection"><path d="M240 145 297 77" strokeDasharray="3 5" /><circle cx="297" cy="77" r="13" /><circle cx="297" cy="77" r="4" fill="currentColor" /></g>
            <g className="signal-radar__nodes"><circle cx="149" cy="130" r="4" /><circle cx="301" cy="229" r="4" /><circle cx="204" cy="225" r="4" /></g>
            <circle className="signal-radar__you" cx="240" cy="145" r="5" /><text x="253" y="151" className="signal-radar__label">YOU</text>
            <text x="317" y="82" className="signal-radar__active-label">{signal.similarity}%</text>
          </svg>
        </div>}
        {chapterIndex === 1 && <SharedWave />}
        {chapterIndex === 2 && <ExchangePreview />}
      </div>
      <div className="signal-track"><div className="signal-track__icon">{chapterIndex === 2 ? <ArrowDownUp size={23} strokeWidth={1.4} aria-hidden="true" /> : <AudioLines size={27} strokeWidth={1.4} aria-hidden="true" />}</div><div><h2>{chapterIndex === 2 ? "交换喜欢的歌" : signal.track}</h2><p>{chapterIndex === 2 ? `${signal.suggestions[0].artist} · ${signal.suggestions[2].artist}` : signal.artist}</p></div></div>
      <div className="signal-console__bottom">{chapterIndex === 0 ? <Spectrum /> : <span className="signal-console__rule" aria-hidden="true" />}</div>
    </section>
  );
}

export function ResonanceLanding() {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  return (
    <div className="resonance-cover" data-paused={isPaused}>
      <a href="#cover-main" className="terminal-skip">跳到主要内容</a>
      <div className="terminal-shell">
        <header className="terminal-header">
          <Link href="/" className="terminal-brand" aria-label="同频首页"><AudioLines aria-hidden="true" /><strong>同频<span>RESONANCE</span></strong></Link>
          <button type="button" className="terminal-motion" aria-pressed={isPaused} aria-label={isPaused ? "播放装饰动效" : "暂停装饰动效"} title={isPaused ? "播放动效" : "暂停动效"} onClick={() => setIsPaused(value => !value)}>{isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
          <AppearanceToggle />
        </header>
        <main id="cover-main" className="terminal-main" tabIndex={-1}>
          <div className="terminal-intro">
            <OrbitalDecorations />
            <h1>听见附近，<br /><em>遇见同频。</em></h1>
            <p className="terminal-intro__summary">发现附近正在听的歌，<br />匿名跟听，交换一首喜欢的音乐。</p>
            <Link href="/nearby" className="terminal-action"><span>进入同频</span><ArrowRight size={20} aria-hidden="true" /></Link>
          </div>
          <div className="terminal-preview">
            <SignalDisplay chapterIndex={chapterIndex} />
            <nav className="terminal-chapters" aria-label="封面章节">{chapters.map((item, index) => <button key={item.name} type="button" aria-pressed={chapterIndex === index} onClick={() => setChapterIndex(index)}><item.icon size={19} strokeWidth={1.4} aria-hidden="true" /><span>{item.label}</span></button>)}</nav>
          </div>
        </main>
        <span className="sr-only" aria-live="polite">{chapters[chapterIndex].label}预览</span>
      </div>
    </div>
  );
}
