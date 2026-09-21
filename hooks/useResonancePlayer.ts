"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioTrack, PlaybackStatus } from "@/lib/resonance/types";
const sourceErrors: Record<string, string> = { PLAYLIST_STALE: "音频文件与歌单不一致，请重新准备歌单并刷新页面。", AUDIO_TOO_LARGE: "这首音频超过 32 MiB，请使用更小的文件。", TRACK_REMOVED: "这首歌已从歌单移除。" };

export function useResonancePlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<AudioTrack | null>(null);
  const requestRef = useRef(0);
  const loadRef = useRef<Promise<void> | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const blobUrl = useRef<string | null>(null);
  const [track, setTrack] = useState<AudioTrack | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(.65);
  const [error, setError] = useState<string | null>(null);
  const invalidateRequests = useCallback(() => { requestRef.current++; }, []);
  const releaseSource = useCallback(() => {
    loadController.current?.abort(); loadController.current = null; loadRef.current = null;
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = .65;
    const metadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      if (trackRef.current && audio.paused && !audio.error && !audio.ended) setStatus("paused");
    };
    const time = () => setCurrentTime(audio.currentTime);
    const playing = () => { setStatus("playing"); setError(null); };
    const pause = () => { if (trackRef.current && !audio.ended && !audio.error) setStatus("paused"); };
    const waiting = () => { if (!audio.paused) setStatus("loading"); };
    const ended = () => { setStatus("ended"); time(); };
    const failed = () => { if (audio.error) { setStatus("error"); setError("音频加载失败，请重试。"); } };
    const events = { loadedmetadata: metadata, durationchange: metadata, timeupdate: time, playing, pause, waiting, ended, error: failed };
    Object.entries(events).forEach(([name, callback]) => audio.addEventListener(name, callback));
    return () => {
      invalidateRequests();
      Object.entries(events).forEach(([name, callback]) => audio.removeEventListener(name, callback));
      audio.pause(); audio.removeAttribute("src"); audio.load();
      releaseSource();
    };
  }, [invalidateRequests, releaseSource]);

  const loadTrack = useCallback((nextTrack: AudioTrack): Promise<void> => {
    const audio = audioRef.current;
    if (!audio) return Promise.reject(new Error("Player not ready"));
    if (!nextTrack.available) return Promise.reject(new Error("TRACK_REMOVED"));
    if (trackRef.current?.id === nextTrack.id && trackRef.current.revision === nextTrack.revision && !audio.error && loadRef.current) return loadRef.current;
    requestRef.current++;
    audio.pause();
    releaseSource();
    audio.removeAttribute("src"); audio.load();
    trackRef.current = nextTrack;
    setTrack(nextTrack); setCurrentTime(0); setDuration(0); setError(null); setStatus("loading");
    const controller = new AbortController();
    loadController.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    // The prepared catalog caps files at 32 MiB. Complete buffering keeps seeking
    // reliable on static hosts without Range, for every supported audio MIME.
    const loading = (async () => {
      try {
        const response = await fetch(nextTrack.audioUrl, { signal: controller.signal });
        if (!response.ok) throw new Error("Audio unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Audio body unavailable");
        const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 32 * 1024 * 1024) { await reader.cancel(); throw new Error("AUDIO_TOO_LARGE"); }
          chunks.push(value);
        }
        if (size !== nextTrack.byteLength) throw new Error("PLAYLIST_STALE");
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const url = URL.createObjectURL(new Blob(chunks, { type: nextTrack.mimeType }));
        blobUrl.current = url;
        audio.src = url; audio.load();
      } catch (cause) {
        if (loadController.current === controller && (!controller.signal.aborted || timedOut)) {
          loadRef.current = null; setStatus("error");
          setError(timedOut ? "音频加载超时，请重试。" : cause instanceof Error && sourceErrors[cause.message] ? sourceErrors[cause.message] : "音频加载失败，请重试。");
        }
        throw cause;
      } finally { clearTimeout(timer); }
    })();
    loadRef.current = loading;
    return loading;
  }, [releaseSource]);

  const prepareTrack = useCallback((nextTrack: AudioTrack) => {
    void loadTrack(nextTrack).catch(() => { /* The loader exposes the error to the UI. */ });
  }, [loadTrack]);

  const playTrack = useCallback(async (nextTrack: AudioTrack) => {
    const audio = audioRef.current;
    if (!audio) return false;
    const loading = loadTrack(nextTrack);
    const request = ++requestRef.current;
    setError(null);
    setStatus("loading");
    try {
      await loading;
      if (request !== requestRef.current) return false;
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
      if (request !== requestRef.current) return false;
      setStatus("playing");
      return true;
    } catch (cause) {
      if (request !== requestRef.current) return false;
      const blocked = cause instanceof DOMException && cause.name === "NotAllowedError";
      setStatus("error");
      setError(blocked ? "浏览器未允许播放，请再点一次播放。" : cause instanceof Error && sourceErrors[cause.message] ? sourceErrors[cause.message] : "暂时无法播放这首歌，请检查格式后重试。");
      return false;
    }
  }, [loadTrack]);

  const pause = useCallback(() => {
    requestRef.current++;
    audioRef.current?.pause();
    if (trackRef.current) setStatus("paused");
  }, []);
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;
    if (!audio.paused) pause();
    else void playTrack(trackRef.current);
  }, [pause, playTrack]);
  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, audio.duration));
    setCurrentTime(audio.currentTime);
    if (audio.currentTime < audio.duration) setStatus(current => current === "ended" ? "paused" : current);
  }, []);
  const changeVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const next = Math.max(0, Math.min(1, value));
    if (audioRef.current) audioRef.current.volume = next;
    setVolume(next);
  }, []);
  const readPosition = useCallback(() => audioRef.current?.currentTime ?? 0, []);
  const changePlaybackRate = useCallback((rate: number) => {
    if (audioRef.current && Number.isFinite(rate)) audioRef.current.playbackRate = Math.max(.95, Math.min(1.05, rate));
  }, []);
  const stop = useCallback(() => {
    requestRef.current++;
    const audio = audioRef.current;
    trackRef.current = null;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    releaseSource();
    setTrack(null); setCurrentTime(0); setDuration(0); setStatus("idle"); setError(null);
  }, [releaseSource]);

  return { audioRef, player: { track, status, currentTime, duration, volume, error, prepareTrack, playTrack, pause, toggle, seek, changeVolume, readPosition, changePlaybackRate, stop } };
}

export type ResonancePlayer = ReturnType<typeof useResonancePlayer>["player"];
