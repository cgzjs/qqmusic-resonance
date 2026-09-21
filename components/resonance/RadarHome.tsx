import { ChevronRight, MapPin, Radio, RefreshCw } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { MusicRadar } from "@/components/resonance/MusicRadar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { sceneLabels } from "@/lib/resonance/demo-data";
import type { NearbyListener, SceneId } from "@/lib/resonance/types";

type RadarHomeProps = {
  isDiscoverable: boolean;
  onDiscoverableChange: (value: boolean) => void;
  scene: SceneId;
  onSceneChange: (scene: SceneId) => void;
  selectedListener: NearbyListener;
  onSelectListener: (listener: NearbyListener) => void;
  onOpenMatch: () => void;
  listeners: NearbyListener[];
  isScanning: boolean;
  onRefresh: () => void;
};

export function RadarHome({
  isDiscoverable,
  onDiscoverableChange,
  scene,
  onSceneChange,
  selectedListener,
  onSelectListener,
  onOpenMatch,
  listeners,
  isScanning,
  onRefresh,
}: RadarHomeProps) {
  return (
    <section className="radar-home">
      <header className="app-header">
        <div>
          <p className="eyebrow">RESONANCE</p>
          <h1>附近</h1>
        </div>
        <div className="discoverable-control">
          <div>
            <strong>{isDiscoverable ? "发现已开启" : "发现已暂停"}</strong>
            <span>音乐相遇</span>
          </div>
          <Switch
            checked={isDiscoverable}
            onCheckedChange={onDiscoverableChange}
            aria-label="开启附近发现"
            className="data-[state=checked]:bg-[#6feee1]"
          />
        </div>
      </header>

      <div className="scene-bar">
        <span className="live-dot" aria-hidden="true" />
        <MapPin aria-hidden="true" size={15} />
        <Select value={scene} onValueChange={(value) => onSceneChange(value as SceneId)}>
          <SelectTrigger size="sm" className="scene-select" aria-label="选择场景">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(sceneLabels) as [SceneId, string][]).map(([id, label]) => (
              <SelectItem value={id} key={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="scene-bar__count">{!isDiscoverable ? "发现已暂停" : isScanning ? "正在寻找" : `${listeners.length} 首歌`}</span>
      </div>

      <div className="radar-heading">
        <div>
          <p className="section-kicker"><Radio aria-hidden="true" size={14} /> 附近动态</p>
          <h2>{isDiscoverable ? "听见附近的此刻" : "发现已暂停"}</h2>
        </div>
        <button type="button" className="refresh-radar" disabled={!isDiscoverable || isScanning} onClick={onRefresh} aria-label="刷新附近"><RefreshCw size={16} aria-hidden="true" />刷新</button>
      </div>

      <div className={isDiscoverable ? "radar-wrap" : "radar-wrap is-paused"}>
        <MusicRadar
          showCenter={isDiscoverable && !isScanning && listeners.length > 0}
          listeners={isDiscoverable && !isScanning ? listeners : []}
          selectedId={selectedListener.id}
          onSelect={onSelectListener}
        />
        {!isDiscoverable && (
          <button type="button" className="resume-radar" onClick={() => onDiscoverableChange(true)}>
            <Radio aria-hidden="true" />
            <strong>继续发现</strong>
          </button>
        )}
        {isDiscoverable && (isScanning || listeners.length === 0) && <div className="radar-empty" role="status"><Radio aria-hidden="true" /><strong>{isScanning ? "正在寻找附近的音乐" : "这里暂时没有音乐信号"}</strong><span>{isScanning ? "正在寻找新的音乐" : "试试其他场景，或再次刷新"}</span></div>}
      </div>

      {isDiscoverable && !isScanning && listeners.length > 0 && (
        <article className="match-card" aria-live="polite">
          <AlbumTile coverUrl={selectedListener.coverUrl} accent={selectedListener.accent} size="md" />
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
