export const PRESENCE_MS = 30_000;
export const INVITE_MS = 45_000;
export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export type NearbyPeer = { id: string; alias: string; trackId: string };
export type NearbyInvite = { id: string; from: string; to: string; fromAlias: string; toAlias: string; trackId: string; expiresAt: number; status: InviteStatus };
export type SessionTicket = { roomId: string; token: string };
export type NearbySnapshot = { self: NearbyPeer; peers: NearbyPeer[]; invite: NearbyInvite | null; ticket: SessionTicket | null; serverTime: number };
