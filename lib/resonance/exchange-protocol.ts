export type ExchangeRole = "host" | "guest";
export const EXCHANGE_LIFETIME_MS = 60_000;
export type RoomExchange = {
  id: string; from: ExchangeRole; offeredTrackId: string; responseTrackId?: string;
  createdAt: number; expiresAt: number; completedAt?: number;
  status: "pending" | "completed" | "declined" | "cancelled" | "expired" | "ended";
  saved: Record<ExchangeRole, boolean>;
};
export type ExchangeCommand = {
  type: "exchange"; id: string; action: "offer" | "respond" | "decline" | "cancel";
  sentAt: number; exchangeId?: string; trackId?: string;
};
export type OnlineExchangeRecord = { id: string; roomId: string; sentTrackId: string; receivedTrackId: string; completedAt: number };
export type ExchangeOutbox = { exchange: RoomExchange; accounts: Record<ExchangeRole, string>; saved: Record<ExchangeRole, boolean>; attempts: number; nextAttemptAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRoomExchange(value: unknown): value is RoomExchange {
  if (!value || typeof value !== "object") return false;
  const item = value as RoomExchange;
  return typeof item.id === "string" && uuid.test(item.id) && ["host", "guest"].includes(item.from) && typeof item.offeredTrackId === "string" && Number.isFinite(item.createdAt) && Number.isFinite(item.expiresAt) && ["pending", "completed", "declined", "cancelled", "expired", "ended"].includes(item.status) && !!item.saved && typeof item.saved.host === "boolean" && typeof item.saved.guest === "boolean" && (item.status !== "completed" || (typeof item.responseTrackId === "string" && item.responseTrackId !== item.offeredTrackId && Number.isFinite(item.completedAt)));
}

export function transitionExchange(current: RoomExchange | null, role: ExchangeRole, command: ExchangeCommand, now: number, bothOnline: boolean, trackIds: readonly string[]): { exchange: RoomExchange; error?: never } | { error: string; exchange?: never } {
  if (now - command.sentAt > 10_000 || command.sentAt - now > 1500) return { error: "EXCHANGE_STALE" };
  if (command.action === "offer") {
    if (current?.status === "pending" && current.expiresAt > now) return { error: "EXCHANGE_BUSY" };
    if (!bothOnline) return { error: "PEER_OFFLINE" };
    if (!command.trackId || !trackIds.includes(command.trackId)) return { error: "INVALID_TRACK" };
    return { exchange: { id: command.id, from: role, offeredTrackId: command.trackId, createdAt: now, expiresAt: now + EXCHANGE_LIFETIME_MS, status: "pending", saved: { host: false, guest: false } } };
  }
  if (!current || current.id !== command.exchangeId || current.status !== "pending" || now >= current.expiresAt) return { error: "EXCHANGE_FINISHED" };
  if (command.action === "cancel") return role === current.from ? { exchange: { ...current, status: "cancelled" } } : { error: "EXCHANGE_FORBIDDEN" };
  if (role === current.from) return { error: "EXCHANGE_FORBIDDEN" };
  if (command.action === "decline") return { exchange: { ...current, status: "declined" } };
  if (!bothOnline) return { error: "PEER_OFFLINE" };
  if (!command.trackId || !trackIds.includes(command.trackId) || command.trackId === current.offeredTrackId) return { error: "EXCHANGE_INVALID_REPLY" };
  return { exchange: { ...current, responseTrackId: command.trackId, completedAt: now, status: "completed" } };
}

export function exchangeRecord(roomId: string, exchange: RoomExchange, role: ExchangeRole): OnlineExchangeRecord {
  if (exchange.status !== "completed" || !exchange.responseTrackId || exchange.completedAt === undefined) throw new Error("Exchange is not completed");
  return { id: exchange.id, roomId, sentTrackId: role === exchange.from ? exchange.offeredTrackId : exchange.responseTrackId, receivedTrackId: role === exchange.from ? exchange.responseTrackId : exchange.offeredTrackId, completedAt: exchange.completedAt };
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
