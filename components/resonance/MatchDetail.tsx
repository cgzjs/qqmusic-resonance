import { Headphones, Send, ShieldCheck, Sparkles } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { ViewHeader } from "@/components/resonance/ViewHeader";
import { Button } from "@/components/ui/button";
import type { NearbyListener } from "@/lib/resonance/types";

type MatchDetailProps = {
  listener: NearbyListener;
  onBack: () => void;
  onListen: () => void;
  onExchange: () => void;
};

export function MatchDetail({ listener, onBack, onListen, onExchange }: MatchDetailProps) {
  return (
    <section className="screen-view">
      <ViewHeader eyebrow="一次匿名相遇" title="你们听得很近" onBack={onBack} />

      <div className="match-hero">
        <div className="match-orbit" aria-hidden="true">
          <span />
          <span />
          <AlbumTile accent={listener.accent} size="lg" />
        </div>
        <div className="similarity-badge">
          <strong>{listener.similarity}%</strong>
          <span>音乐同频</span>
        </div>
        <h3>{listener.track}</h3>
        <p>{listener.artist} · TA 正在听</p>
      </div>

      <div className="insight-card">
        <div className="insight-card__title">
          <Sparkles aria-hidden="true" size={17} />
          <strong>为什么你们合拍</strong>
        </div>
        <div className="tag-row">
          {listener.genres.map((genre) => <span key={genre}>{genre}</span>)}
        </div>
        <p>共同喜欢 {listener.sharedArtists.join("、")}，最近的夜间听歌节奏也很接近。</p>
      </div>

      <div className="privacy-line">
        <ShieldCheck aria-hidden="true" size={16} />
        <span>TA 只能看到你的音乐，不会看到身份和精确位置</span>
      </div>

      <div className="screen-actions">
        <Button className="primary-action" onClick={onListen}>
          <Headphones aria-hidden="true" /> 从同一秒开始听
        </Button>
        <Button variant="outline" className="secondary-action" onClick={onExchange}>
          <Send aria-hidden="true" /> 丢一首歌给 TA
        </Button>
      </div>
    </section>
  );
}
