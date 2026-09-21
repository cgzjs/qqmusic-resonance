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
          <AlbumTile coverUrl={listener.coverUrl} accent={listener.accent} size="lg" />
        </div>
        <div className="similarity-badge">
          <strong>{listener.similarity}%</strong>
          <span>音乐同频</span>
        </div>
        <h3>{listener.track}</h3>
        <p>{listener.artist}</p>
      </div>

      <div className="insight-card">
        <div className="insight-card__title">
          <Sparkles aria-hidden="true" size={17} />
          <strong>为什么你们合拍</strong>
        </div>
        <div className="tag-row">
          {listener.genres.map((genre) => <span key={genre}>{genre}</span>)}
        </div>
        <p>从 {listener.genres.join("、")}，找到下一首喜欢的歌。</p>
      </div>

      <div className="privacy-line">
        <ShieldCheck aria-hidden="true" size={16} />
        <span>TA 只能看到你的音乐，不会看到身份和精确位置</span>
      </div>

      <div className="screen-actions">
        <Button className="primary-action" onClick={onListen}>
          <Headphones aria-hidden="true" /> 试听这首歌
        </Button>
        <Button disabled={!listener.suggestions.length} variant="outline" className="secondary-action" onClick={onExchange}>
          <Send aria-hidden="true" /> 丢一首歌给 TA
        </Button>
      </div>
      {!listener.suggestions.length && <p className="demo-notice">歌单至少需要两首歌才能交换。</p>}
    </section>
  );
}
