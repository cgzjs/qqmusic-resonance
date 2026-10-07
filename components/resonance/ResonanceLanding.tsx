"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, AudioLines, Bookmark, Crosshair, Headphones, Heart, Link2, Mail, MapPin, Pause, PenLine, Play, Sparkles, Type } from "lucide-react";
import { coverWaveformPeaks } from "@/lib/resonance/demo-data";
import { OrbitalDecorations } from "@/components/resonance/OrbitalDecorations";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import { AppearanceToggle } from "./Appearance";
import "@/app/landing.css";

const chapters = [
  { name: "discover", label: "附近发现", icon: Crosshair, seconds: 10, title: "一首歌，遇见一个人。", description: "看看附近在听什么，喜欢就一起听。", tags: ["主动开启", "匿名相遇", "随时暂停"] },
  { name: "sync", label: "一起听", icon: Headphones, seconds: 9, title: "同一首歌，同一刻。", description: "同步播放，打个招呼，送 TA 一首。", tags: ["同步进度", "轻互动", "送歌"] },
  { name: "place", label: "地点留声", icon: MapPin, seconds: 12, title: "把一首歌，留在这里。", description: "写一句、画一笔，或让 AI 配张图。", tags: ["500 米内", "留给后来的人"] },
  { name: "journey", label: "音乐足迹", icon: Bookmark, seconds: 9, title: "相遇之后，音乐留下。", description: "收到的歌、收藏与待听，都在足迹里。", tags: ["收到的歌", "收藏", "待听"] },
];

type PostcardMode = "text" | "drawing" | "ai";
const postcardModes = [
  { name: "text", label: "写一句", icon: Type },
  { name: "drawing", label: "画一笔", icon: PenLine },
  { name: "ai", label: "AI 配图", icon: Sparkles },
] as const;

const sweepDelay = (x: number, y: number) => {
  const turn = (Math.atan2(y - 145, x - 240) - Math.atan2(57 - 145, 335 - 240)) / (2 * Math.PI);
  return `${((turn + 1) % 1 * 18).toFixed(2)}s`;
};
const radarNodes = [[149, 130], [301, 229], [204, 225], [297, 77]].map(([x, y]) => ({ x, y, delay: sweepDelay(x, y) }));
// An illustrative waveform, independent of actual playback.
const waveformSamples = Array.from({ length: coverWaveformPeaks.length * 2 }, (_, index) => {
  const peakIndex = Math.floor(index / 2);
  const peak = index % 2 === 0 ? coverWaveformPeaks[peakIndex] : Math.round((coverWaveformPeaks[peakIndex] + coverWaveformPeaks[Math.min(peakIndex + 1, coverWaveformPeaks.length - 1)]) / 2);
  return {
    top: Math.max(3, Math.round(peak * (48 + (index * 37 % 47)) / 190)),
    bottom: Math.max(3, Math.round(peak * (42 + (index * 29 % 53)) / 215)),
  };
});

function WaveformBars({ played = false }: { played?: boolean }) {
  return <svg className={`listening-waveform__bars${played ? " listening-waveform__bars--played" : ""}`} viewBox={`0 0 ${waveformSamples.length * 3} 100`} preserveAspectRatio="none" aria-hidden="true">
    {waveformSamples.map(({ top, bottom }, index) => <path key={index} d={`M${index * 3 + 1} ${50 - top}v${top + bottom}`} />)}
  </svg>;
}

function RadarPreview() {
  return <div className="signal-radar" role="img" aria-label="音乐发现示意：唱片符号代表你与附近的匿名听众">
    <svg viewBox="0 0 480 290" aria-hidden="true">
      <g className="signal-radar__grid"><path d="M240 12v266M45 145h390" /><circle cx="240" cy="145" r="45" /><circle cx="240" cy="145" r="88" /><circle cx="240" cy="145" r="130" /></g>
      <g className="signal-radar__sweep"><path d="M240 145 335 57" /><path d="M240 145 323 44" opacity=".4" /><path d="M240 145 309 34" opacity=".15" /></g>
      <g className="signal-radar__connection"><path d="M240 145 297 77" strokeDasharray="3 5" /></g>
      {radarNodes.map(node => <g key={node.x}><circle className="signal-radar__cover-ring" cx={node.x} cy={node.y} r="19" /><circle className="signal-radar__groove" cx={node.x} cy={node.y} r="13" /><circle className="signal-radar__center" cx={node.x} cy={node.y} r="3" /></g>)}
      <g className="signal-radar__pings">{radarNodes.map(node => <circle key={node.x} cx={node.x} cy={node.y} r="19" style={{ animationDelay: node.delay }} />)}</g>
      <circle className="signal-radar__cover-ring signal-radar__cover-ring--you" cx="240" cy="145" r="28" />
      <circle className="signal-radar__groove" cx="240" cy="145" r="20" /><circle className="signal-radar__groove" cx="240" cy="145" r="13" /><circle className="signal-radar__center" cx="240" cy="145" r="5" />
      <text x="240" y="189" textAnchor="middle" className="signal-radar__label">你正在听</text>
      <text x="323" y="82" className="signal-radar__active-label">TA 在听</text>
    </svg>
  </div>;
}

function SharedWave() {
  return <div className="signal-sync" role="img" aria-label="一起听示意：两位听众共享歌曲与播放进度，可以打招呼和送歌">
    <div className="signal-sync__people" aria-hidden="true"><span><Headphones size={16} />你</span><span className="signal-sync__connection"><Link2 size={16} /></span><span>TA<Headphones size={16} /></span></div>
    <div className="listening-waveform" aria-hidden="true"><span className="listening-waveform__baseline" /><WaveformBars /><WaveformBars played /><span className="listening-waveform__cursor"><i /></span></div>
    <div className="signal-sync__song" aria-hidden="true"><AlbumTile accent="var(--terminal-cyan)" size="sm" /><div><strong>同一首喜欢的歌</strong><span>共享播放进度</span></div><Heart size={17} /><Mail size={17} /></div>
  </div>;
}

function SketchPreview() {
  return <svg viewBox="0 0 400 180" className="signal-postcard__sketch" role="img" aria-label="手绘留言示例：一朵小花和路边的落日">
    <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M25 142q45-22 90-2t90 0 90 1 80-1M25 151q80-7 135 2t115-1 100 2" opacity=".5" />
      <circle cx="299" cy="73" r="26" /><path d="m299 32 1-9m0 91 0 8m-42-49-10 0m94 1 10 1m-81-33-7-7m66 66 7 7m-69-1 6-7m57-57 6-7" />
      <path d="M117 140q-3-23 2-46m0 31q-18-21-30-15 2 18 28 15m2-8q17-21 30-16-4 17-30 16" />
      <path d="M120 68c-22-31-38 5-16 13-31 9-8 38 8 20 9 27 37 9 23-7 31 0 26-34 3-27 14-25-18-39-18 1Z" /><circle cx="122" cy="83" r="9" />
      <path d="M181 55q9-10 18 0 9-10 18 0m-52 16q7-7 14 0 7-7 14 0" opacity=".65" />
    </g>
  </svg>;
}

function PostcardPreview({ mode, onModeChange }: { mode: PostcardMode; onModeChange: (mode: PostcardMode) => void }) {
  return <div className="signal-place">
    <article className="signal-postcard" aria-label="声音明信片示例">
      <div className="signal-postcard__address"><span>TO / 下一位路过的人</span><MapPin size={15} aria-hidden="true" /></div>
      <div className="signal-postcard__art" data-content={mode}>
        {mode === "ai" && <Image src="/assets/ambient/sound-postcard-bg.png" alt="AI 配图示例：暮色中的山与湖面" fill unoptimized sizes="(max-width: 800px) 80vw, 400px" />}
        {mode === "drawing" && <SketchPreview />}
        {mode === "text" && <div className="signal-postcard__note"><p>路过这里时，<br />愿你也有一首喜欢的歌。</p><span><Sparkles size={13} aria-hidden="true" />AI 也能帮你写一句</span></div>}
      </div>
      <div className="signal-postcard__song"><AlbumTile accent="var(--terminal-cyan)" size="sm" /><div><strong>随信附上一首歌</strong><span>音乐替你传达</span></div><span className="signal-postcard__stamp" aria-hidden="true">留声<br />HERE</span></div>
    </article>
    <div className="signal-place__modes" role="group" aria-label="预览留言形式">{postcardModes.map(item => <button type="button" key={item.name} aria-pressed={mode === item.name} onClick={() => onModeChange(item.name)}><item.icon size={14} aria-hidden="true" />{item.label}</button>)}</div>
  </div>;
}

function JourneyPreview() {
  const records = [
    { label: "收到的歌", caption: "来自 TA 的心意", icon: Mail },
    { label: "收藏的喜欢", caption: "把喜欢留在身边", icon: Heart },
    { label: "留着慢慢听", caption: "下一次，再听见", icon: Bookmark },
  ];
  return <div className="signal-journey" aria-label="音乐足迹示例">
    <div className="signal-journey__heading"><span>一路听来</span><Bookmark size={17} aria-hidden="true" /></div>
    <div className="signal-journey__records">{records.map(({ label, caption, icon: Icon }) => <div className="signal-journey__record" key={label}><AlbumTile accent="var(--terminal-cyan)" size="sm" /><div><strong>{label}</strong><span>{caption}</span></div><Icon size={17} aria-hidden="true" /></div>)}</div>
  </div>;
}

function SignalDisplay({ chapterIndex, postcardMode, onPostcardModeChange }: { chapterIndex: number; postcardMode: PostcardMode; onPostcardModeChange: (mode: PostcardMode) => void }) {
  const chapter = chapters[chapterIndex];
  return <section className="signal-console" data-mode={chapter.name} aria-label={`${chapter.label}预览`}>
    <div className="signal-console__heading"><span>功能预览 <i>/</i> {String(chapterIndex + 1).padStart(2, "0")}</span><chapter.icon size={17} aria-hidden="true" /></div>
    <div className="signal-display" data-mode={chapter.name}>
      {chapterIndex === 0 && <RadarPreview />}
      {chapterIndex === 1 && <SharedWave />}
      {chapterIndex === 2 && <PostcardPreview mode={postcardMode} onModeChange={onPostcardModeChange} />}
      {chapterIndex === 3 && <JourneyPreview />}
    </div>
    <div className="signal-caption"><h2>{chapter.title}</h2><p>{chapter.description}</p></div>
    <div className="signal-console__bottom">{chapter.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
  </section>;
}

export function ResonanceLanding() {
  const [chapterIndex, setChapterIndex] = useState(2);
  const [postcardMode, setPostcardMode] = useState<PostcardMode>("ai");
  const [picked, setPicked] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const updateVisibility = () => setIsHidden(document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => setIsPreviewVisible(entry.intersectionRatio >= .15), { threshold: .15 }) : null;
    if (previewRef.current) observer?.observe(previewRef.current);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  return <div className="resonance-cover" data-paused={isPaused || isHidden || !isPreviewVisible}>
    <a href="#cover-main" className="terminal-skip">跳到主要内容</a>
    <div className="terminal-shell">
      <header className="terminal-header">
        <Link href="/" className="terminal-brand" aria-label="同频首页"><AudioLines aria-hidden="true" /><strong>同频<span>RESONANCE</span></strong></Link>
        <button type="button" className="terminal-motion" aria-pressed={isPaused} aria-label={isPaused ? "播放展示动效" : "暂停展示动效"} title={isPaused ? "播放动效" : "暂停动效"} onClick={() => setIsPaused(value => !value)}>{isPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
        <AppearanceToggle />
      </header>
      <main id="cover-main" className="terminal-main" tabIndex={-1}>
        <div className="terminal-intro">
          <OrbitalDecorations />
          <p className="terminal-intro__eyebrow">人与人，歌与此地。</p>
          <h1>听见附近，<br /><em>留住同频。</em></h1>
          <p className="terminal-intro__summary">和此刻的人一起听，<br />给后来的人留一首歌。</p>
          <Link href="/nearby" className="terminal-action"><span>进入同频</span><ArrowRight size={20} aria-hidden="true" /></Link>
        </div>
        <div className="terminal-preview" ref={previewRef} onFocusCapture={() => setPicked(true)}>
          <SignalDisplay chapterIndex={chapterIndex} postcardMode={postcardMode} onPostcardModeChange={setPostcardMode} />
          <nav className="terminal-chapters" aria-label="功能展示">{chapters.map((item, index) => <button key={item.name} type="button" aria-pressed={chapterIndex === index} onClick={() => { setPicked(true); setChapterIndex(index); }}><item.icon size={18} strokeWidth={1.5} aria-hidden="true" /><span>{item.label}</span>{!picked && chapterIndex === index && <i className="terminal-chapters__progress" aria-hidden="true" style={{ "--chapter-seconds": `${item.seconds}s` } as CSSProperties} onAnimationEnd={() => setChapterIndex(value => (value + 1) % chapters.length)} />}</button>)}</nav>
        </div>
      </main>
      <footer className="terminal-footer"><span>音乐先于身份。</span><span>QQ 音乐概念插件 · 非官方原型</span></footer>
      <span className="sr-only" aria-live="polite">{picked ? `${chapters[chapterIndex].label}预览` : ""}</span>
    </div>
  </div>;
}
