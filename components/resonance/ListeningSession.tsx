"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Heart, Pause, Send, Hand } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { ViewHeader } from "@/components/resonance/ViewHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { NearbyListener } from "@/lib/resonance/types";

type ListeningSessionProps = {
  listener: NearbyListener;
  onBack: () => void;
  onExchange: () => void;
};

export function ListeningSession({ listener, onBack, onExchange }: ListeningSessionProps) {
  const [progress, setProgress] = useState(38);
  const [reaction, setReaction] = useState<"wave" | "heart" | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 92 ? 38 : current + 0.25));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="screen-view listening-view">
      <ViewHeader eyebrow="同步跟听中" title="此刻，2 人在线" onBack={onBack} />

      <div className="listening-art">
        <div className="sound-wave" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--bar": index } as CSSProperties} />)}
        </div>
        <AlbumTile accent={listener.accent} size="lg" />
        <div className="listener-pips" aria-label="两位听众在线">
          <span>你</span>
          <i />
          <span>TA</span>
        </div>
      </div>

      <div className="now-playing">
        <p>NOW PLAYING TOGETHER</p>
        <h3>{listener.track}</h3>
        <span>{listener.artist}</span>
      </div>

      <div className="player-progress">
        <Progress value={progress} aria-label="播放进度" />
        <div><span>06:31</span><span>17:07</span></div>
      </div>

      <div className="reaction-row">
        <Button
          variant="outline"
          className={reaction === "wave" ? "reaction-button is-active" : "reaction-button"}
          onClick={() => setReaction("wave")}
        >
          <Hand aria-hidden="true" /> 打个招呼
        </Button>
        <Button
          variant="outline"
          className={reaction === "heart" ? "reaction-button is-active" : "reaction-button"}
          onClick={() => setReaction("heart")}
        >
          <Heart aria-hidden="true" /> 这首不错
        </Button>
      </div>

      <div className="session-status" aria-live="polite">
        {reaction ? <span>已送出一个轻轻的{reaction === "wave" ? "招呼" : "喜欢"}</span> : <span>不用说话，让音乐待一会儿</span>}
      </div>

      <div className="player-controls">
        <Button variant="ghost" size="icon" className="round-control" aria-label="暂停">
          <Pause aria-hidden="true" fill="currentColor" />
        </Button>
        <Button className="exchange-cta" onClick={onExchange}>
          <Send aria-hidden="true" /> 交换一首
        </Button>
      </div>
    </section>
  );
}
