import { Clock3, Disc3, Headphones, Music2, Radio, Route, Sparkles } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { Button } from "@/components/ui/button";
import { nearbyListeners } from "@/lib/resonance/demo-data";

type JourneySummaryProps = {
  onReturn: () => void;
};

const stats = [
  { label: "遇见", value: "14", unit: "位听歌的人", icon: Headphones },
  { label: "最高同频", value: "92%", unit: "来自 Lamp", icon: Radio },
  { label: "交换", value: "3", unit: "首陌生人的歌", icon: Music2 },
];

export function JourneySummary({ onReturn }: JourneySummaryProps) {
  return (
    <section className="screen-view journey-view">
      <header className="journey-header">
        <div>
          <p>TODAY · SHANGHAI</p>
          <h2>今天的音乐旅程</h2>
        </div>
        <span><Route aria-hidden="true" /></span>
      </header>

      <div className="journey-route">
        <div className="route-line" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <span>18:42</span>
          <strong>南京西路</strong>
          <p>第一次遇见 Fishmans</p>
        </div>
        <div>
          <span>19:06</span>
          <strong>世纪大道</strong>
          <p>和陌生人听完了半首歌</p>
        </div>
        <div>
          <span>19:28</span>
          <strong>回到地面</strong>
          <p>带走了 1 首新收藏</p>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map(({ label, value, unit, icon: Icon }) => (
          <article key={label}>
            <Icon aria-hidden="true" size={17} />
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{unit}</small>
          </article>
        ))}
      </div>

      <div className="journey-tracks">
        <div className="journey-tracks__heading">
          <div><Disc3 aria-hidden="true" size={17} /><strong>今天经过的歌</strong></div>
          <span><Clock3 aria-hidden="true" size={14} /> 47 分钟</span>
        </div>
        {nearbyListeners.slice(0, 3).map((listener) => (
          <div className="mini-track" key={listener.id}>
            <AlbumTile accent={listener.accent} size="sm" />
            <div><strong>{listener.track}</strong><span>{listener.artist}</span></div>
            <small>{listener.similarity}%</small>
          </div>
        ))}
      </div>

      <Button className="primary-action" onClick={onReturn}>
        <Sparkles aria-hidden="true" /> 回到音乐雷达
      </Button>
      <p className="journey-disclaimer">只记录区域级地点，不保存精确移动轨迹</p>
    </section>
  );
}
