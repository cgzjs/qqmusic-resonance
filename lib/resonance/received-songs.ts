import type { AccountData } from "./host-protocol";

export type ReceivedSong = { id: string; sentTrackId: string; receivedTrackId: string; receivedAt: number; unread: boolean };

export function receivedSongs(data: Pick<AccountData, "events" | "onlineExchanges" | "readExchangeIds">): ReceivedSong[] {
  const read = new Set(data.readExchangeIds ?? []);
  const items = [
    ...data.events.filter(event => event.type === "exchange" && event.receivedTrackId).map(event => ({ id: `demo:${event.id}`, sentTrackId: event.trackId, receivedTrackId: event.receivedTrackId!, receivedAt: Date.parse(event.createdAt) })),
    ...(data.onlineExchanges ?? []).map(event => ({ id: `online:${event.roomId}:${event.id}`, sentTrackId: event.sentTrackId, receivedTrackId: event.receivedTrackId, receivedAt: event.completedAt })),
  ];
  return [...new Map(items.map(item => [item.id, { ...item, unread: !read.has(item.id) }])).values()].sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
}

// Use the same completed, deduplicated deliveries as the inbox. "Today" follows
// the device's calendar day, matching the dates displayed in the journey.
export function exchangesOnDay(items: readonly ReceivedSong[], day = new Date()): number {
  const localDay = day.toDateString();
  return items.filter(item => new Date(item.receivedAt).toDateString() === localDay).length;
}
