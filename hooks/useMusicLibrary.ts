"use client";

import { useSyncExternalStore } from "react";
import { audioTracks, playableListeners } from "@/lib/resonance/demo-data";
import { emptyLibrary, LIBRARY_KEY, parseLibrary, updateLibrary, type LibraryAction } from "@/lib/resonance/library";

const trackIds = new Set(audioTracks.map(track => track.id));
const listenerIds = new Set(playableListeners.map(listener => listener.id));
const serverSnapshot = { library: emptyLibrary, storageUnavailable: false };
let snapshot = serverSnapshot;
let initialized = false;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach(callback => callback());

function readStorage() {
  try { snapshot = { library: parseLibrary(localStorage.getItem(LIBRARY_KEY), trackIds, listenerIds), storageUnavailable: false }; }
  catch { snapshot = { ...snapshot, storageUnavailable: true }; }
  initialized = true;
}
function getSnapshot() {
  if (!initialized && typeof window !== "undefined") readStorage();
  return snapshot;
}
function subscribe(callback: () => void) {
  subscribers.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIBRARY_KEY || event.key === null) { readStorage(); notify(); }
  };
  window.addEventListener("storage", onStorage);
  return () => { subscribers.delete(callback); window.removeEventListener("storage", onStorage); };
}
function dispatch(action: LibraryAction) {
  getSnapshot();
  const library = updateLibrary(snapshot.library, action);
  let storageUnavailable = false;
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(library)); }
  catch { storageUnavailable = true; }
  snapshot = { library, storageUnavailable };
  notify();
}
export function useMusicLibrary() {
  return { ...useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot), dispatch };
}
