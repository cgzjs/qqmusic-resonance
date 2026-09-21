"use client";
import { useCallback, useMemo } from "react";
import { useHost } from "@/components/resonance/HostProvider";
import type { LibraryAction } from "@/lib/resonance/library";
import type { MusicLibrary } from "@/lib/resonance/types";

export function useAccountLibrary() {
  const { data, save } = useHost();
  const library = useMemo<MusicLibrary>(() => ({ version: 1, favoriteIds: data.favoriteIds, listenLaterIds: data.listenLaterIds, events: data.events }), [data]);
  const dispatch = useCallback((action: LibraryAction) => {
    if (action.type === "event") return save("event", action.event.trackId, undefined, action.event);
    return save(action.type === "removeFavorite" ? "unfavorite" : action.type, action.trackId);
  }, [save]);
  return { library, dispatch, onlineHistory: data.history, onlineExchanges: data.onlineExchanges ?? [] };
}
