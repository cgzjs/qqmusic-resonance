export const PRESENCE_MS = 30_000;
export type BlockedListener = { id: string; alias: string; createdAt: number };
export type NearbyPeer = { id: string; alias: string; trackId: string };
// 邀请人是 guest，收到邀请的一方是 host，主动接受后继续掌控播放。
export type SessionTicket = { roomId: string; token: string; role: "host" | "guest"; peerAlias: string };
export type NearbySnapshot = { self: NearbyPeer; peers: NearbyPeer[]; ticket: SessionTicket | null; serverTime: number };
