"use client";

import type { CSSProperties } from "react";
import { Headphones, Music2 } from "lucide-react";

import type { NearbyListener } from "@/lib/resonance/types";

type MusicRadarProps = {
  listeners: NearbyListener[];
  selectedId: string;
  onSelect: (listener: NearbyListener) => void;
};

export function MusicRadar({ listeners, selectedId, onSelect }: MusicRadarProps) {
  return (
    <section className="radar-shell" aria-label="附近音乐雷达">
      <div className="radar-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <i />
        <i />
      </div>

      <div className="radar-center" aria-label="你的位置">
        <div className="radar-center__glow" />
        <Headphones aria-hidden="true" size={19} strokeWidth={2.2} />
        <span>YOU</span>
      </div>

      {listeners.map((listener, index) => {
        const isSelected = listener.id === selectedId;
        return (
          <button
            key={listener.id}
            type="button"
            className="radar-node"
            data-selected={isSelected}
            style={
              {
                left: `${listener.position.x}%`,
                top: `${listener.position.y}%`,
                "--node-accent": listener.accent,
                "--float-delay": `${index * -0.7}s`,
              } as CSSProperties
            }
            aria-label={`${listener.track}，同频度 ${listener.similarity}%`}
            aria-pressed={isSelected}
            onClick={() => onSelect(listener)}
          >
            <Music2 aria-hidden="true" size={14} />
            <span>{listener.similarity}%</span>
          </button>
        );
      })}
    </section>
  );
}
