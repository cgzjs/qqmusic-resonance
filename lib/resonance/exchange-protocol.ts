export type ExchangeRole = "host" | "guest";
/**
 * 一起听时“送 TA 一首”：单向，送出即完成，不用对方回一首。
 * responseTrackId 只出现在旧版双向交换留下的数据里。
 */
export type RoomExchange = {
  id: string; from: ExchangeRole; offeredTrackId: string; responseTrackId?: string;
  createdAt: number; completedAt: number; status: "completed";
  saved: Record<ExchangeRole, boolean>;
};
export type ExchangeCommand = { type: "exchange"; id: string; action: "offer"; sentAt: number; trackId: string };
/** 送出的一方只有 sentTrackId，收到的一方只有 receivedTrackId；旧版交换两个都有。 */
export type OnlineExchangeRecord = { id: string; roomId: string; sentTrackId?: string; receivedTrackId?: string; completedAt: number };
export type ExchangeOutbox = { exchange: RoomExchange; accounts: Record<ExchangeRole, string>; saved: Record<ExchangeRole, boolean>; attempts: number; nextAttemptAt: number };

export function sendGift(role: ExchangeRole, command: ExchangeCommand, now: number, bothOnline: boolean, trackIds: readonly string[]): { exchange: RoomExchange; error?: never } | { error: string; exchange?: never } {
  if (now - command.sentAt > 10_000 || command.sentAt - now > 1500) return { error: "EXCHANGE_STALE" };
  if (!bothOnline) return { error: "PEER_OFFLINE" };
  if (!command.trackId || !trackIds.includes(command.trackId)) return { error: "INVALID_TRACK" };
  return { exchange: { id: command.id, from: role, offeredTrackId: command.trackId, createdAt: now, completedAt: now, status: "completed", saved: { host: false, guest: false } } };
}

export function exchangeRecord(roomId: string, exchange: RoomExchange, role: ExchangeRole): OnlineExchangeRecord {
  const [sentTrackId, receivedTrackId] = role === exchange.from ? [exchange.offeredTrackId, exchange.responseTrackId] : [exchange.responseTrackId, exchange.offeredTrackId];
  return { id: exchange.id, roomId, ...(sentTrackId ? { sentTrackId } : {}), ...(receivedTrackId ? { receivedTrackId } : {}), completedAt: exchange.completedAt };
}

// Keep failed destinations in durable outbox state, including after a room ends.
export async function deliverExchange(entry: ExchangeOutbox, roomId: string, now: number, write: (accountId: string, record: OnlineExchangeRecord) => Promise<boolean>): Promise<ExchangeOutbox> {
  const saved = { ...entry.saved };
  await Promise.all((["host", "guest"] as const).map(async role => {
    if (saved[role]) return;
    try { saved[role] = await write(entry.accounts[role], exchangeRecord(roomId, entry.exchange, role)); } catch { saved[role] = false; }
  }));
  const attempts = entry.attempts + 1;
  return { ...entry, saved, attempts, nextAttemptAt: now + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)) };
}
