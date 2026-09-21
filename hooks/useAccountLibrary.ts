"use client";
import { useCallback, useMemo } from "react";
import { useHost } from "@/components/resonance/HostProvider";
import type { LibraryAction } from "@/lib/resonance/library";
import type { MusicLibrary } from "@/lib/resonance/types";
import { receivedSongs } from "@/lib/resonance/received-songs";

export function useAccountLibrary() {
  const { data, save } = useHost();
  const library = useMemo<MusicLibrary>(() => ({ version: 1, favoriteIds: data.favoriteIds, listenLaterIds: data.listenLaterIds, events: data.events }), [data]);
  const received = useMemo(() => receivedSongs(data), [data]);
  const markExchangeRead = useCallback((id: string) => save("readExchange", "", id), [save]);
  const queueExchange = useCallback((event: import("@/lib/resonance/types").JourneyEvent) => save("queueExchange", event.trackId, event.id, event), [save]);
  const dispatch = useCallback((action: LibraryAction) => {
    if (action.type === "event") return save("event", action.event.trackId, undefined, action.event);
    return save(action.type === "removeFavorite" ? "unfavorite" : action.type, action.trackId);
  }, [save]);
  return { library, dispatch, onlineHistory: data.history, onlineExchanges: data.onlineExchanges ?? [], received, markExchangeRead, unreadCount: received.filter(item => item.unread).length, queueExchange, demoReplies: data.demoReplies ?? [] };
}
