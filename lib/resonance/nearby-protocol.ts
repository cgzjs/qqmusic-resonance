export const PRESENCE_MS = 30_000;
export type BlockedListener = { id: string; alias: string; createdAt: number };
export type NearbyPeer = { id: string; alias: string; trackId: string };
// 免邀请：跟听方是 guest，被跟的一方是 host（继续放自己的歌）。
export type SessionTicket = { roomId: string; token: string; role: "host" | "guest"; peerAlias: string };
export type NearbySnapshot = { self: NearbyPeer; peers: NearbyPeer[]; ticket: SessionTicket | null; serverTime: number };
