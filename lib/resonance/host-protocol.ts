export type HostSession = { accountId: string; token: string; expiresAt: number; displayName: string; mode: "demo" };
export type HostSnapshot = { status: "loading" | "ready" | "signed-out" | "expired" | "unavailable"; session: HostSession | null; trackId: string | null; error: string | null };
export type AccountAction = "favorite" | "unfavorite" | "listen" | "later" | "removeLater" | "event" | "readExchange" | "queueExchange" | "queueWave" | "queueHeart";
export type AccountData = { favoriteIds: string[]; listenLaterIds: string[]; events: import("./types").JourneyEvent[]; history: { id: string; trackId: string; listenedAt: number }[]; onlineExchanges: import("./exchange-protocol").OnlineExchangeRecord[]; readExchangeIds: string[]; demoReplies: import("./demo-reply").DemoReply[] };
export const emptyAccountData: AccountData = { favoriteIds: [], listenLaterIds: [], events: [], history: [], onlineExchanges: [], readExchangeIds: [], demoReplies: [] };

// Application-owned integration seam, not an official QQ Music SDK API.
// The real adapter must exchange host authorization for a verified plugin session.
export interface HostAdapter {
  restore(): Promise<HostSnapshot>;
  requestAuthorization(): Promise<HostSnapshot>;
  subscribe(listener: (snapshot: HostSnapshot) => void): () => void;
}

export function accountHeaders(session: HostSession): Record<string, string> {
  return { "X-Account-Id": session.accountId, "X-Account-Token": session.token };
}
