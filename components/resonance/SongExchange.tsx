"use client";

import { Check, Heart, Music2, Send, LoaderCircle } from "lucide-react";
import { AlbumTile } from "@/components/resonance/AlbumTile";
import { ViewHeader } from "@/components/resonance/ViewHeader";
import { Button } from "@/components/ui/button";
import type { AudioTrack, ExchangeStatus, NearbyListener } from "@/lib/resonance/types";
import { ExchangeSignal } from "./ReactionDock";

type SongExchangeProps = {
  isSaving?: boolean;
  listener: NearbyListener;
  selectedSongId: string;
  status: ExchangeStatus;
  receivedTrack: AudioTrack | null;
  onSelectSong: (id: string) => void;
  onSend: () => void;
  onBack: () => void;
  onSave: () => void;
  onListenLater: () => void;
};

export function SongExchange({ listener, selectedSongId, status, receivedTrack, onSelectSong, onSend, onBack, onSave, onListenLater, isSaving = false }: SongExchangeProps) {
  const selectedSong = listener.suggestions.find(song => song.id === selectedSongId);
  if (status === "received" && receivedTrack) return (
    <section className="screen-view exchange-result">
      <ViewHeader eyebrow="演示交换完成" title="收到一首新音乐" onBack={onBack} />
      <ExchangeSignal received />
      <div className="exchange-celebration"><span className="success-mark"><Check aria-hidden="true" /></span><p>你送出了《{selectedSong?.track}》</p></div>
      <article className="received-song"><AlbumTile coverUrl={receivedTrack.coverUrl} accent={receivedTrack.accent} size="lg" /><p>FOR YOU</p><h3>{receivedTrack.track}</h3><span>{receivedTrack.artist}</span><blockquote>来自模拟听众的音乐回应</blockquote></article>
      <div className="screen-actions"><Button disabled={isSaving} className="primary-action" onClick={onSave}><Heart aria-hidden="true" />{isSaving ? "正在保存到账号…" : "收藏并完成相遇"}</Button><Button disabled={isSaving} variant="outline" className="secondary-action" onClick={onListenLater}>加入稍后再听</Button></div>
    </section>
  );
  const isSending = status === "sending";
  return (
    <section className="screen-view">
      <ViewHeader eyebrow="交换一首" title="从你的世界里挑一首" onBack={onBack} />
      <ExchangeSignal sending={isSending} />
      <p className="exchange-intro">挑选一首内置试听，体验一次匿名音乐交换。</p>
      <fieldset className="song-list" disabled={isSending}><legend className="sr-only">选择要推荐的歌曲</legend>
        {listener.suggestions.map(song => <label className="song-option" data-selected={selectedSongId === song.id} key={song.id}><AlbumTile coverUrl={song.coverUrl} accent={song.accent} size="sm" /><span className="song-option__copy"><strong>{song.track}</strong><small>{song.artist}</small></span><span className="song-option__reason">{song.reason}</span><input type="radio" name="exchange-song" value={song.id} checked={selectedSongId === song.id} onChange={() => onSelectSong(song.id)} aria-label={song.track} /></label>)}
      </fieldset>
      <div className="recommend-note"><Music2 aria-hidden="true" size={17} /><div><span>这次相遇</span><p>来自 {listener.track}</p></div></div>
      <Button className="primary-action exchange-send" disabled={isSending || !selectedSong} onClick={onSend}>{isSending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}{isSending ? "正在等待模拟回应…" : "匿名送出这首歌"}</Button>
      <p className="demo-notice" role="status">{isSending ? "返回可取消本次发送" : "本地演示，对方回应由场景模拟"}</p>
    </section>
  );
}
