"use client";

import { useState } from "react";
import { Check, Heart, Music2, Send } from "lucide-react";

import { AlbumTile } from "@/components/resonance/AlbumTile";
import { ViewHeader } from "@/components/resonance/ViewHeader";
import { Button } from "@/components/ui/button";
import type { NearbyListener, SongSuggestion } from "@/lib/resonance/types";

type SongExchangeProps = {
  listener: NearbyListener;
  onBack: () => void;
  onComplete: () => void;
};

export function SongExchange({ listener, onBack, onComplete }: SongExchangeProps) {
  const [selectedSong, setSelectedSong] = useState<SongSuggestion>(listener.suggestions[0]);
  const [sent, setSent] = useState(false);

  if (sent) {
    const received = listener.suggestions[2];
    return (
      <section className="screen-view exchange-result">
        <ViewHeader eyebrow="交换成功" title="TA 也给你留了一首" onBack={onBack} />
        <div className="exchange-celebration">
          <span className="success-mark"><Check aria-hidden="true" /></span>
          <p>你送出了《{selectedSong.track}》</p>
        </div>
        <article className="received-song">
          <AlbumTile accent={received.accent} size="lg" />
          <p>FROM A PASSERBY</p>
          <h3>{received.track}</h3>
          <span>{received.artist}</span>
          <blockquote>“{received.reason}”</blockquote>
        </article>
        <div className="screen-actions">
          <Button className="primary-action" onClick={onComplete}>
            <Heart aria-hidden="true" /> 收藏并完成相遇
          </Button>
          <Button variant="ghost" onClick={onComplete}>稍后再听</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-view">
      <ViewHeader eyebrow="交换一首" title="从你的世界里挑一首" onBack={onBack} />
      <p className="exchange-intro">对方会先看到音乐，听完后才会看见你的回应。</p>

      <div className="song-list" role="radiogroup" aria-label="选择要推荐的歌曲">
        {listener.suggestions.map((song) => {
          const isSelected = selectedSong.id === song.id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={isSelected}
              className="song-option"
              data-selected={isSelected}
              key={song.id}
              onClick={() => setSelectedSong(song)}
            >
              <AlbumTile accent={song.accent} size="sm" />
              <span className="song-option__copy">
                <strong>{song.track}</strong>
                <small>{song.artist}</small>
              </span>
              <span className="song-option__reason">{song.reason}</span>
              <span className="radio-mark">{isSelected && <Check aria-hidden="true" size={14} />}</span>
            </button>
          );
        })}
      </div>

      <div className="recommend-note">
        <Music2 aria-hidden="true" size={17} />
        <div>
          <span>推荐理由</span>
          <p>因为你刚刚在听 {listener.track}</p>
        </div>
      </div>

      <Button className="primary-action exchange-send" onClick={() => setSent(true)}>
        <Send aria-hidden="true" /> 匿名送出这首歌
      </Button>
    </section>
  );
}
