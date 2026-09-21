"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioTracks } from "@/lib/resonance/demo-data";
import { playbackPosition, type RoomSnapshot } from "@/lib/resonance/room-protocol";
import type { ConnectionState } from "./useListeningRoom";
import type { ResonancePlayer } from "./useResonancePlayer";

export function useRoomAudio(room: RoomSnapshot | null, connection: ConnectionState, offset: number, player: ResonancePlayer, isSynchronized: () => boolean) {
  const [needsGesture, setNeedsGesture] = useState(false);
  const blocked = useRef(false);
  const latest = useRef({ room, connection, offset, player, isSynchronized });
  const synchronize = useRef<(() => void) | null>(null);
  useEffect(() => {
    latest.current = { room, connection, offset, player, isSynchronized };
    // Apply pushed state promptly even when background-tab timers are throttled.
    queueMicrotask(() => synchronize.current?.());
  }, [room, connection, offset, player, isSynchronized]);

  useEffect(() => {
    let active = true, starting = false;
    const sync = () => {
      if (!active) return;
      const current = latest.current;
      const { room: state, player: audio } = current;
      if (!current.isSynchronized() || current.connection !== "connected" || !state || state.closed) {
        if (audio.status === "playing" || audio.status === "loading") audio.pause();
        audio.changePlaybackRate(1);
        return;
      }
      const track = audioTracks.find(item => item.id === state.playback.trackId);
      if (!track) return;
      if (audio.track?.id !== track.id || audio.track.revision !== track.revision) { blocked.current = false; setNeedsGesture(false); audio.prepareTrack(track); return; }
      if (!audio.duration || audio.status === "error") return;
      const target = playbackPosition(state.playback, Date.now() + current.offset, audio.duration);
      const shouldPlay = state.playback.playing && target < audio.duration;
      const delta = target - audio.readPosition();
      if (Math.abs(delta) > .5 || (!shouldPlay && Math.abs(delta) > .06)) { audio.seek(target); audio.changePlaybackRate(1); }
      else audio.changePlaybackRate(shouldPlay && Math.abs(delta) > .08 ? 1 + Math.max(-.025, Math.min(.025, delta * .08)) : 1);
      if (!shouldPlay) {
        if (audio.status === "playing" || audio.status === "loading") audio.pause();
      } else if (!blocked.current && !starting && audio.status !== "playing" && audio.status !== "loading") {
        starting = true;
        void audio.playTrack(track).then(ok => {
          starting = false;
          if (active && !ok && latest.current.connection === "connected" && latest.current.room?.playback.trackId === track.id) { blocked.current = true; setNeedsGesture(true); }
        });
      }
    };
    synchronize.current = sync;
    const frame = requestAnimationFrame(sync);
    const timer = window.setInterval(sync, 250);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("pageshow", sync);
    return () => { active = false; synchronize.current = null; cancelAnimationFrame(frame); window.clearInterval(timer); document.removeEventListener("visibilitychange", sync); window.removeEventListener("offline", sync); window.removeEventListener("pageshow", sync); };
  }, []);

  const enableAudio = useCallback(async () => {
    const current = latest.current;
    if (!current.isSynchronized() || !current.room || current.connection !== "connected") return;
    const track = audioTracks.find(item => item.id === current.room!.playback.trackId);
    if (!track) return;
    blocked.current = false; setNeedsGesture(false);
    if (current.room.playback.playing) {
      const ok = await current.player.playTrack(track);
      if (!ok) { blocked.current = true; setNeedsGesture(true); }
    } else current.player.prepareTrack(track);
  }, []);

  return { needsGesture, enableAudio };
}
