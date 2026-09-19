import { ChevronRight, MapPin, Radio } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { MusicRadar } from "@/components/resonance/MusicRadar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { nearbyListeners, sceneLabels } from "@/lib/resonance/demo-data";
import type { NearbyListener, SceneId } from "@/lib/resonance/types";

type RadarHomeProps = {
  isDiscoverable: boolean;
  onDiscoverableChange: (value: boolean) => void;
  scene: SceneId;
  onSceneChange: (scene: SceneId) => void;
  selectedListener: NearbyListener;
  onSelectListener: (listener: NearbyListener) => void;
  onOpenMatch: () => void;
};

export function RadarHome({
  isDiscoverable,
  onDiscoverableChange,
  scene,
  onSceneChange,
  selectedListener,
  onSelectListener,
  onOpenMatch,
}: RadarHomeProps) {
  return (
    <section className="radar-home">
      <header className="app-header">
        <div>
          <p className="eyebrow">QQ MUSIC LAB · CONCEPT</p>
          <h1>同频</h1>
        </div>
        <div className="discoverable-control">
          <div>
            <strong>{isDiscoverable ? "正在被音乐发现" : "仅自己可见"}</strong>
            <span>{isDiscoverable ? "匿名开放" : "雷达已暂停"}</span>
          </div>
          <Switch
            checked={isDiscoverable}
            onCheckedChange={onDiscoverableChange}
            aria-label="开启同频模式"
            className="data-[state=checked]:bg-[#b9ff66]"
          />
        </div>
      </header>

      <div className="scene-bar">
        <span className="live-dot" aria-hidden="true" />
        <MapPin aria-hidden="true" size={15} />
        <Select value={scene} onValueChange={(value) => onSceneChange(value as SceneId)}>
          <SelectTrigger size="sm" className="scene-select" aria-label="选择模拟场景">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(sceneLabels) as [SceneId, string][]).map(([id, label]) => (
              <SelectItem value={id} key={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="scene-bar__count">{isDiscoverable ? "4 首歌正在靠近" : "发现已暂停"}</span>
      </div>

      <div className="radar-heading">
        <div>
          <p className="section-kicker"><Radio aria-hidden="true" size={14} /> LIVE</p>
          <h2>{isDiscoverable ? "听见附近的此刻" : "暂时离开人群"}</h2>
        </div>
        <p>越靠近中心，越合拍</p>
      </div>

      <div className={isDiscoverable ? "radar-wrap" : "radar-wrap is-paused"}>
        <MusicRadar
          listeners={isDiscoverable ? nearbyListeners : []}
          selectedId={selectedListener.id}
          onSelect={onSelectListener}
        />
        {!isDiscoverable && (
          <button type="button" className="resume-radar" onClick={() => onDiscoverableChange(true)}>
            <Radio aria-hidden="true" />
            <strong>重新进入同频</strong>
            <span>附近的人只能看见你的音乐</span>
          </button>
        )}
      </div>

      {isDiscoverable && (
        <article className="match-card" aria-live="polite">
          <AlbumTile accent={selectedListener.accent} size="md" />
          <div className="match-card__copy">
            <span>{selectedListener.distanceLabel}</span>
            <h3>{selectedListener.track}</h3>
            <p>{selectedListener.artist}</p>
          </div>
          <div className="match-score">
            <strong>{selectedListener.similarity}%</strong>
            <span>同频</span>
          </div>
          <Button className="listen-button" size="icon" aria-label={`查看 ${selectedListener.track}`} onClick={onOpenMatch}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </article>
      )}
    </section>
  );
}
