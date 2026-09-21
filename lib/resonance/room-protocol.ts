import type { ExchangeCommand, RoomExchange } from "./exchange-protocol";
export type RoomRole = "host" | "guest";
export type ReactionKind = "wave" | "heart";
export type RoomReaction = { id: string; kind: ReactionKind; from: RoomRole; trackId: string; createdAt: number };
export type ReactionDelivery = { id: string; kind: ReactionKind; status: "sending" | "sent" | "received" | "failed"; error?: string };
export const REACTION_TTL_MS = 6000;
export const REACTION_COOLDOWN_MS = 2000;
export type RoomPlayback = { trackId: string; position: number; playing: boolean; updatedAt: number };
export type RoomSnapshot = {
  id: string;
  revision: number;
  expiresAt: number;
  closed: boolean;
  hostConnected: boolean;
  guestConnected: boolean;
  playback: RoomPlayback;
  exchange?: RoomExchange | null;
  exchangeEnabled?: boolean;
  catalogVersion?: string;
};
export type RoomCommand = {
  type: "command";
  id: string;
  revision: number;
  action: "play" | "pause" | "seek" | "track";
  position?: number;
  trackId?: string;
};
export type RoomMessage =
  | { type: "hello"; token: string; clientId: string; accountToken?: string }
  | { type: "ping"; sentAt: number }
  | { type: "leave" }
  | { type: "reaction"; id: string; kind: ReactionKind; trackId: string; sentAt: number }
  | { type: "reaction-received"; id: string }
  | RoomCommand
  | ExchangeCommand;

export const ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const RECONNECT_GRACE_MS = 90_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRoomMessage(raw: string): RoomMessage | null {
  if (raw.length > 4096) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (value.type === "hello" && typeof value.token === "string" && UUID_PATTERN.test(value.token) && typeof value.clientId === "string" && UUID_PATTERN.test(value.clientId)) return { type: "hello", token: value.token, clientId: value.clientId, ...(typeof value.accountToken === "string" && UUID_PATTERN.test(value.accountToken) ? { accountToken: value.accountToken } : {}) };
    if (value.type === "ping" && Number.isFinite(value.sentAt)) return { type: "ping", sentAt: value.sentAt };
    if (value.type === "leave") return { type: "leave" };
    if (value.type === "exchange") {
      if (typeof value.id !== "string" || !UUID_PATTERN.test(value.id) || !Number.isFinite(value.sentAt) || !["offer", "respond", "decline", "cancel"].includes(value.action)) return null;
      if (value.action !== "offer" && (typeof value.exchangeId !== "string" || !UUID_PATTERN.test(value.exchangeId))) return null;
      if (["offer", "respond"].includes(value.action) && (typeof value.trackId !== "string" || value.trackId.length > 64)) return null;
      return { type: "exchange", id: value.id, action: value.action, sentAt: value.sentAt, ...(value.action !== "offer" ? { exchangeId: value.exchangeId } : {}), ...(["offer", "respond"].includes(value.action) ? { trackId: value.trackId } : {}) };
    }
    if (value.type === "reaction-received" && typeof value.id === "string" && UUID_PATTERN.test(value.id)) return { type: "reaction-received", id: value.id };
    if (value.type === "reaction" && typeof value.id === "string" && UUID_PATTERN.test(value.id) && ["wave", "heart"].includes(value.kind) && typeof value.trackId === "string" && value.trackId.length <= 64 && Number.isFinite(value.sentAt)) return { type: "reaction", id: value.id, kind: value.kind, trackId: value.trackId, sentAt: value.sentAt };
    if (value.type !== "command" || typeof value.id !== "string" || !UUID_PATTERN.test(value.id) || !Number.isSafeInteger(value.revision) || value.revision < 0) return null;
    if (!["play", "pause", "seek", "track"].includes(value.action)) return null;
    if (value.action === "seek" && !Number.isFinite(value.position)) return null;
    if (value.action === "track" && (typeof value.trackId !== "string" || value.trackId.length > 64)) return null;
    return { type: "command", id: value.id, revision: value.revision, action: value.action, ...(value.action === "seek" ? { position: value.position } : {}), ...(value.action === "track" ? { trackId: value.trackId } : {}) };
  } catch { return null; }
}

export function playbackPosition(playback: RoomPlayback, now: number, duration: number): number {
  return Math.min(duration, Math.max(0, playback.position + (playback.playing ? Math.max(0, now - playback.updatedAt) / 1000 : 0)));
}

export function settledPlayback(playback: RoomPlayback, now: number, duration: number): RoomPlayback {
  if (playback.playing && playbackPosition(playback, now, duration) >= duration) {
    return { ...playback, position: duration, playing: false, updatedAt: now };
  }
  return { ...playback };
}

export function applyRoomCommand(snapshot: RoomSnapshot, role: RoomRole, command: RoomCommand, now: number, durations: Record<string, number>): { ok: true; playback: RoomPlayback } | { ok: false; error: string } {
  if (snapshot.closed || now >= snapshot.expiresAt) return { ok: false, error: "ROOM_CLOSED" };
  if (role !== "host") return { ok: false, error: "HOST_ONLY" };
  if (command.revision !== snapshot.revision) return { ok: false, error: "STALE_REVISION" };
  const duration = durations[snapshot.playback.trackId];
  if (!Number.isFinite(duration) || duration <= 0) return { ok: false, error: "TRACK_UNAVAILABLE" };
  let position = playbackPosition(snapshot.playback, now, duration);
  let playing = snapshot.playback.playing && position < duration;
  let trackId = snapshot.playback.trackId;
  if (command.action === "play") { if (position >= duration) position = 0; playing = true; }
  if (command.action === "pause") playing = false;
  if (command.action === "seek") {
    if (!Number.isFinite(command.position)) return { ok: false, error: "INVALID_COMMAND" };
    position = Math.min(duration, Math.max(0, command.position!));
    if (position >= duration) playing = false;
  }
  if (command.action === "track") {
    if (!command.trackId || !Object.hasOwn(durations, command.trackId)) return { ok: false, error: "INVALID_TRACK" };
    trackId = command.trackId; position = 0;
  }
  return { ok: true, playback: { trackId, position, playing, updatedAt: now } };
}

export function clockOffset(sentAt: number, receivedAt: number, serverTime: number): number {
  return serverTime - (sentAt + receivedAt) / 2;
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as RoomSnapshot;
  if (item.exchange !== undefined && item.exchange !== null) {
    const exchange = item.exchange;
    if (typeof exchange.id !== "string" || !UUID_PATTERN.test(exchange.id) || !["host", "guest"].includes(exchange.from) || typeof exchange.offeredTrackId !== "string" || !Number.isFinite(exchange.createdAt) || !Number.isFinite(exchange.expiresAt) || !["pending", "completed", "declined", "cancelled", "expired", "ended"].includes(exchange.status) || !exchange.saved || typeof exchange.saved.host !== "boolean" || typeof exchange.saved.guest !== "boolean") return false;
    if (exchange.status === "completed" && (typeof exchange.responseTrackId !== "string" || exchange.responseTrackId === exchange.offeredTrackId || !Number.isFinite(exchange.completedAt))) return false;
  }
  return typeof item.id === "string" && UUID_PATTERN.test(item.id) && Number.isSafeInteger(item.revision) && item.revision >= 0 && Number.isFinite(item.expiresAt) && typeof item.closed === "boolean" && typeof item.hostConnected === "boolean" && typeof item.guestConnected === "boolean" && !!item.playback && typeof item.playback.trackId === "string" && Number.isFinite(item.playback.position) && item.playback.position >= 0 && typeof item.playback.playing === "boolean" && Number.isFinite(item.playback.updatedAt);
}
