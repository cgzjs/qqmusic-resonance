import type { AccountData } from "./host-protocol";

/** 收到的歌。sentTrackId 只在旧版双向交换里有：那时是“你送出一首、TA 回了这首”。 */
export type ReceivedSong = { id: string; sentTrackId?: string; receivedTrackId: string; receivedAt: number; unread: boolean };

export function receivedSongs(data: Pick<AccountData, "events" | "onlineExchanges" | "readExchangeIds">): ReceivedSong[] {
  const read = new Set(data.readExchangeIds ?? []);
  const items = [
    ...data.events.filter(event => event.type === "exchange" && event.receivedTrackId).map(event => ({ id: `demo:${event.id}`, sentTrackId: event.trackId, receivedTrackId: event.receivedTrackId!, receivedAt: Date.parse(event.createdAt) })),
    // 自己送出的那一份（只有 sentTrackId）不算收到。
    ...(data.onlineExchanges ?? []).filter(event => event.receivedTrackId).map(event => ({ id: `online:${event.roomId}:${event.id}`, ...(event.sentTrackId ? { sentTrackId: event.sentTrackId } : {}), receivedTrackId: event.receivedTrackId!, receivedAt: event.completedAt })),
  ];
  return [...new Map(items.map(item => [item.id, { ...item, unread: !read.has(item.id) }])).values()].sort((a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id));
}

// Count deduplicated gifts/exchanges. "Today" follows the device's calendar day,
// matching the dates displayed in the journey.
export function exchangesOnDay(items: readonly { receivedAt: number }[], day = new Date()): number {
  const localDay = day.toDateString();
  return items.filter(item => new Date(item.receivedAt).toDateString() === localDay).length;
}
