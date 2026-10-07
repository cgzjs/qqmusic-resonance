import type { PlaceContentType } from "./place-protocol";

export type PlaceDraft = {
  trackId: string;
  title: string;
  message: string;
  contentType: PlaceContentType;
  drawingData: string;
};

export type ClientImageJobState = {
  status: "idle" | "running" | "succeeded" | "failed";
  imageUrl?: string;
  notice?: string;
};
type Entry = { state: ClientImageJobState; draft?: PlaceDraft; listeners: Set<(state: ClientImageJobState) => void>; promise?: Promise<void> };
const entries = new Map<string, Entry>();

function entry(key: string): Entry {
  let current = entries.get(key);
  if (!current) { current = { state: { status: "idle" }, listeners: new Set() }; entries.set(key, current); }
  return current;
}
function publish(current: Entry, state: ClientImageJobState) {
  current.state = state;
  current.listeners.forEach(listener => listener(state));
}
// The editor and its background image share one account-scoped, in-page slot.
export function readPlaceDraft(key: string): PlaceDraft | undefined {
  const draft = entry(key).draft;
  return draft ? { ...draft } : undefined;
}
export function writePlaceDraft(key: string, draft: PlaceDraft) {
  entry(key).draft = { ...draft };
}
export function subscribeImageJob(key: string, listener: (state: ClientImageJobState) => void) {
  const current = entry(key); current.listeners.add(listener); listener(current.state);
  return () => { current.listeners.delete(listener); };
}
export function startImageJob(key: string, runner: () => Promise<{ imageUrl: string; notice: string }>) {
  const current = entry(key);
  if (current.state.status === "running") return;
  const previousImage = current.state.imageUrl;
  current.promise = (async () => {
    publish(current, { status: "running", imageUrl: previousImage, notice: "正在画一张明信片" });
    try {
      const result = await runner();
      publish(current, { status: "succeeded", imageUrl: result.imageUrl, notice: result.notice });
    } catch (error) {
      publish(current, { status: "failed", imageUrl: previousImage, notice: error instanceof Error ? error.message : "生图失败，请重试" });
    } finally {
      current.promise = undefined;
    }
  })();
}
export function resetImageJob(key: string) {
  const current = entry(key);
  if (current.state.status !== "running") publish(current, { status: "idle" });
}
