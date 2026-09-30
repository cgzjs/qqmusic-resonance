import { DurableObject } from "cloudflare:workers";
import { audioTracks } from "../lib/resonance/demo-data";
import { ROOM_LIFETIME_MS, UUID_PATTERN } from "../lib/resonance/room-protocol";
import type { BlockedListener } from "../lib/resonance/nearby-protocol";
import { PRESENCE_MS, type NearbyPeer, type NearbySnapshot, type SessionTicket } from "../lib/resonance/nearby-protocol";
import { locationMusic } from "./location-music";

type Participant = NearbyPeer & { accountId: string; sessionHash?: string; token: string; lastSeen: number; ticket: SessionTicket | null };
const digestSession = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
type Block = BlockedListener & { accountId: string; sourcePeerId?: string; sourceRoomId?: string };
type ActiveRoom = { host: string; guest: string; hostAlias: string; guestAlias: string; expiresAt: number; acceptedAt?: number };
type State = { people: Record<string, Participant>; blocks: Record<string, Block[]>; rooms: Record<string, ActiveRoom>; closingRooms: string[]; follows: Record<string, number> };

// One explicitly labelled demonstration area. It does not infer physical proximity.
export class NearbyArea extends DurableObject<Cloudflare.Env> {
  private state: State = { people: {}, blocks: {}, rooms: {}, closingRooms: [], follows: {} };
  static FOLLOW_COOLDOWN_MS = 15_000;
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      // 旧版本存过邀请，免邀请后直接丢弃。
      const stored = await ctx.storage.get<Partial<State> & { invites?: unknown }>("area");
      if (stored) delete stored.invites;
      this.state = { ...this.state, ...stored };
    });
  }
  private sweep(now: number) {
    for (const [id, room] of Object.entries(this.state.rooms)) if (room.expiresAt <= now) delete this.state.rooms[id];
    this.state.closingRooms = this.state.closingRooms.filter(id => this.state.rooms[id]);
    for (const [account, at] of Object.entries(this.state.follows)) if (now - at >= NearbyArea.FOLLOW_COOLDOWN_MS) delete this.state.follows[account];
    for (const person of Object.values(this.state.people)) if (!audioTracks.some(track => track.id === person.trackId)) delete this.state.people[person.id];
    for (const person of Object.values(this.state.people)) if (now - person.lastSeen > PRESENCE_MS) delete this.state.people[person.id];
  }
  private publicPeer(person: Participant): NearbyPeer { return { id: person.id, alias: person.alias, trackId: person.trackId }; }
  private blocked(a: string, b: string) {
    return this.state.blocks[a]?.some(item => item.accountId === b) || this.state.blocks[b]?.some(item => item.accountId === a);
  }
  private blockList(accountId: string): BlockedListener[] {
    return (this.state.blocks[accountId] ?? []).map(({ id, alias, createdAt }) => ({ id, alias, createdAt }));
  }
  private async closeBlockedRooms() {
    for (const id of [...this.state.closingRooms]) {
      const room = this.state.rooms[id];
      if (!room) continue;
      try {
        const result = await this.env.ROOMS.get(this.env.ROOMS.idFromName(id)).fetch(new Request("https://room.internal/close-for-block", { method: "POST", body: JSON.stringify({ host: room.host, guest: room.guest }), signal: AbortSignal.timeout(4000) }));
        if (!result.ok) continue;
        this.state.closingRooms = this.state.closingRooms.filter(value => value !== id);
        delete this.state.rooms[id];
      } catch { /* The durable alarm retries; a failed close must not undo a block. */ }
    }
  }
  private snapshot(person: Participant): NearbySnapshot {
    return { self: this.publicPeer(person), peers: Object.values(this.state.people).filter(peer => peer.accountId !== person.accountId && !peer.ticket && !this.blocked(person.accountId, peer.accountId)).map(peer => this.publicPeer(peer)), ticket: person.ticket, serverTime: Date.now() };
  }
  private async save() {
    await this.ctx.storage.put("area", this.state);
    if (Object.keys(this.state.people).length || Object.keys(this.state.rooms).length || this.state.closingRooms.length) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }
  async alarm() { await this.ctx.blockConcurrencyWhile(async () => { this.sweep(Date.now()); await this.closeBlockedRooms(); await this.save(); }); }
  async fetch(request: Request): Promise<Response> {
    // Serialize follow + room allocation across awaits: one listener can only be in one room.
    return this.ctx.blockConcurrencyWhile(async () => {
      if (new URL(request.url).pathname.startsWith("/api/bottles/")) return locationMusic(request, this.ctx);
      const now = Date.now(); this.sweep(now);
      const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
      const fail = (error: string, status = 409) => reply({ error }, status);
      const action = new URL(request.url).pathname.split("/").pop();
      let body: Record<string, unknown> = {};
      if (request.method === "POST") {
        try { body = await request.json(); } catch { return fail("INVALID_BODY", 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_BODY", 400);
      }
      if (action === "revoke") {
        const sessionHash = typeof body.accountToken === "string" ? await digestSession(body.accountToken) : null;
        for (const peer of Object.values(this.state.people)) if (peer.accountId === body.accountId && (!sessionHash || peer.sessionHash === sessionHash)) delete this.state.people[peer.id];
        await this.save(); return reply({ ok: true });
      }
      // The worker authenticates these account-scoped actions. Discovery can be off.
      const actor = request.headers.get("X-Account-Id")!;
      if (action === "blocks" && request.method === "GET") return reply({ blocks: this.blockList(actor) });
      if (action === "unblock" && request.method === "POST") {
        if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) return fail("INVALID_BODY", 400);
        this.state.blocks[actor] = (this.state.blocks[actor] ?? []).filter(item => item.id !== body.id);
        if (!this.state.blocks[actor].length) delete this.state.blocks[actor];
        await this.save(); return reply({ blocks: this.blockList(actor) });
      }
      if (action === "block" && request.method === "POST") {
        const peerId = typeof body.targetId === "string" && UUID_PATTERN.test(body.targetId) ? body.targetId : null;
        const roomId = typeof body.roomId === "string" && UUID_PATTERN.test(body.roomId) ? body.roomId : null;
        if (!!peerId === !!roomId || (body.targetId !== undefined && !peerId) || (body.roomId !== undefined && !roomId)) return fail("INVALID_BODY", 400);
        const entries = this.state.blocks[actor] ?? [];
        const previous = entries.find(item => peerId ? item.sourcePeerId === peerId : item.sourceRoomId === roomId);
        const peer = peerId ? this.state.people[peerId] : null;
        const room = roomId ? this.state.rooms[roomId] : null;
        const role = room?.host === actor ? "host" : room?.guest === actor ? "guest" : null;
        const other = role === "host" ? "guest" : "host";
        const targetAccount = previous?.accountId ?? peer?.accountId ?? (room && role ? room[other] : null);
        if (!targetAccount || actor === targetAccount) return fail("UNAVAILABLE");
        let entry = entries.find(item => item.accountId === targetAccount);
        if (!entry) {
          if (entries.length >= 100) return fail("BLOCK_LIMIT", 429);
          entry = { id: crypto.randomUUID(), accountId: targetAccount, alias: peer?.alias ?? (room && role ? room[other === "host" ? "hostAlias" : "guestAlias"] : "同频听众"), createdAt: now, ...(peerId ? { sourcePeerId: peerId } : { sourceRoomId: roomId! }) };
          this.state.blocks[actor] = [...entries, entry];
        }
        for (const [id, activeRoom] of Object.entries(this.state.rooms)) {
          if ((activeRoom.host === actor && activeRoom.guest === targetAccount) || (activeRoom.guest === actor && activeRoom.host === targetAccount)) {
            if (!this.state.closingRooms.includes(id)) this.state.closingRooms.push(id);
            for (const person of Object.values(this.state.people)) if (person.ticket?.roomId === id) person.ticket = null;
          }
        }
        // Persist both the relationship and closure jobs before any cross-object await.
        await this.save(); await this.closeBlockedRooms(); await this.save();
        return reply({ blocks: this.blockList(actor), closing: this.state.closingRooms.some(id => { const pending = this.state.rooms[id]; return pending && (pending.host === actor || pending.guest === actor); }) });
      }
      if (action === "start" && request.method === "POST") {
        const accountId = request.headers.get("X-Account-Id")!;
        if (Object.values(this.state.people).some(person => person.accountId === accountId)) return fail("ALREADY_DISCOVERING");
        if (!audioTracks.some(track => track.id === body.trackId)) return fail("INVALID_TRACK", 400);
        if (Object.keys(this.state.people).length >= 100) return fail("AREA_FULL", 429);
        const id = crypto.randomUUID(), token = crypto.randomUUID();
        const person: Participant = { id, token, accountId, sessionHash: await digestSession(request.headers.get("X-Account-Token") ?? ""), alias: `听众 ${id.slice(0, 4).toUpperCase()}`, trackId: body.trackId as string, lastSeen: now, ticket: null };
        this.state.people[id] = person; await this.save();
        return reply({ token, ...this.snapshot(person) }, 201);
      }
      const bearer = request.headers.get("Authorization");
      const person = Object.values(this.state.people).find(peer => bearer === `Bearer ${peer.token}` && peer.accountId === request.headers.get("X-Account-Id"));
      if (!person) return fail("SESSION_EXPIRED", 401);
      // 等待中的邀请可能已被取消或超时，确认房间仍有效再展示或接受。
      if ((action === "state" || action === "accept") && person.ticket?.role === "host") {
        const status = await this.env.ROOMS.get(this.env.ROOMS.idFromName(person.ticket.roomId)).fetch(new Request("https://room.internal/status", { signal: AbortSignal.timeout(4000) }));
        if (status.status === 404) person.ticket = null;
        else if (!status.ok) return fail("CONNECT_FAILED", 503);
      }
      if (action === "state" && request.method === "GET") { person.lastSeen = now; await this.save(); return reply(this.snapshot(person)); }
      if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
      if (action === "accept") {
        if (!person.ticket || person.ticket.role !== "host" || person.ticket.roomId !== body.roomId) { await this.save(); return fail("UNAVAILABLE"); }
        const active = this.state.rooms[person.ticket.roomId];
        if (!active || active.host !== actor) return fail("UNAVAILABLE");
        active.acceptedAt = now;
        person.lastSeen = now; await this.save(); return reply(this.snapshot(person));
      }
      if (action === "decline") {
        if (!person.ticket || person.ticket.role !== "host" || person.ticket.roomId !== body.roomId) return fail("UNAVAILABLE");
        const roomId = person.ticket.roomId, active = this.state.rooms[roomId];
        if (!active || active.host !== actor || active.acceptedAt) return fail("UNAVAILABLE");
        try {
          const closed = await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId)).fetch(new Request("https://room.internal/decline", { method: "POST", body: JSON.stringify({ host: active.host, guest: active.guest }), signal: AbortSignal.timeout(4000) }));
          if (!closed.ok) return fail(closed.status === 409 ? "UNAVAILABLE" : "CONNECT_FAILED", closed.status === 409 ? 409 : 503);
        } catch { return fail("CONNECT_FAILED", 503); }
        for (const peer of Object.values(this.state.people)) if (peer.ticket?.roomId === roomId) peer.ticket = null;
        delete this.state.rooms[roomId]; person.lastSeen = now;
        await this.save(); return reply(this.snapshot(person));
      }
      if (action === "stop") { delete this.state.people[person.id]; await this.save(); return reply({ ok: true }); }
      person.lastSeen = now;
      if (action === "track") {
        if (!audioTracks.some(track => track.id === body.trackId)) return fail("INVALID_TRACK", 400);
        person.trackId = body.trackId as string;
      } else if (action === "follow") {
        const target = typeof body.targetId === "string" && UUID_PATTERN.test(body.targetId) ? this.state.people[body.targetId] : null;
        if (!target || target.accountId === person.accountId || this.blocked(person.accountId, target.accountId)) return fail("UNAVAILABLE");
        if (person.ticket || target.ticket) return fail("BUSY");
        // 按账号限制邀请频率，重新打开附近可见也不重置。
        if (now - (this.state.follows[person.accountId] ?? 0) < NearbyArea.FOLLOW_COOLDOWN_MS) return fail("COOLDOWN", 429);
        this.state.follows[person.accountId] = now;
        const roomId = crypto.randomUUID();
        const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId)).fetch(new Request("https://room.internal/init", { method: "POST", body: JSON.stringify({ id: roomId, trackId: target.trackId, nearby: true, accounts: { host: target.accountId, guest: person.accountId }, ...(request.headers.get("X-Account-Scope") === "preview" ? { accountScope: "preview" } : {}) }) }));
        if (!response.ok) return fail("CONNECT_FAILED", 503);
        const room = await response.json<{ hostToken: string; guestToken: string }>();
        this.state.rooms[roomId] = { host: target.accountId, guest: person.accountId, hostAlias: target.alias, guestAlias: person.alias, expiresAt: now + ROOM_LIFETIME_MS };
        // 被跟的一方继续掌控播放，跟听的一方同步收听。
        target.ticket = { roomId, token: room.hostToken, role: "host", peerAlias: person.alias };
        person.ticket = { roomId, token: room.guestToken, role: "guest", peerAlias: target.alias };
      } else return fail("NOT_FOUND", 404);
      await this.save(); return reply(this.snapshot(person));
    });
  }
}
