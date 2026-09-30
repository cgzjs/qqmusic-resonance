export type ClientImageJobState = {
  status: "idle" | "running" | "succeeded" | "failed";
  imageUrl?: string;
  notice?: string;
};
type Entry = { state: ClientImageJobState; listeners: Set<(state: ClientImageJobState) => void>; promise?: Promise<void> };
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
export function subscribeImageJob(key: string, listener: (state: ClientImageJobState) => void) {
  const current = entry(key); current.listeners.add(listener); listener(current.state);
  return () => { current.listeners.delete(listener); };
}
export function startImageJob(key: string, runner: () => Promise<{ imageUrl: string; notice: string }>) {
  const current = entry(key);
  if (current.state.status === "running") return;
  current.promise = (async () => {
    publish(current, { status: "running", notice: "正在画一张明信片" });
    try {
      const result = await runner();
      publish(current, { status: "succeeded", imageUrl: result.imageUrl, notice: result.notice });
    } catch (error) {
      publish(current, { status: "failed", notice: error instanceof Error ? error.message : "生图失败，请重试" });
    } finally {
      current.promise = undefined;
    }
  })();
}
export function resetImageJob(key: string) {
  const current = entry(key);
  if (current.state.status !== "running") publish(current, { status: "idle" });
}
