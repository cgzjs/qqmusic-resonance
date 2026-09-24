import { DurableObject } from "cloudflare:workers";
import { audioTracks } from "../lib/resonance/demo-data";
import { ROOM_LIFETIME_MS, UUID_PATTERN } from "../lib/resonance/room-protocol";
import type { BlockedListener } from "../lib/resonance/nearby-protocol";
import { INVITE_MS, PRESENCE_MS, type NearbyInvite, type NearbyPeer, type NearbySnapshot, type SessionTicket } from "../lib/resonance/nearby-protocol";

type Participant = NearbyPeer & { accountId: string; sessionHash?: string; token: string; lastSeen: number; lastInvite: number; inviteId: string | null; ticket: SessionTicket | null; pairs: Record<string, number> };
const digestSession = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
type Block = BlockedListener & { accountId: string; sourcePeerId?: string; sourceRoomId?: string };
type ActiveRoom = { host: string; guest: string; hostAlias: string; guestAlias: string; expiresAt: number };
type State = { people: Record<string, Participant>; invites: Record<string, NearbyInvite>; blocks: Record<string, Block[]>; rooms: Record<string, ActiveRoom>; closingRooms: string[] };

// One explicitly labelled demonstration area. It does not infer physical proximity.
export class NearbyArea extends DurableObject<Cloudflare.Env> {
  private state: State = { people: {}, invites: {}, blocks: {}, rooms: {}, closingRooms: [] };
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.state = { ...this.state, ...await ctx.storage.get<State>("area") }; });
  }
  private sweep(now: number) {
    for (const [id, room] of Object.entries(this.state.rooms)) if (room.expiresAt <= now) delete this.state.rooms[id];
    this.state.closingRooms = this.state.closingRooms.filter(id => this.state.rooms[id]);
    for (const person of Object.values(this.state.people)) if (!audioTracks.some(track => track.id === person.trackId)) delete this.state.people[person.id];
    for (const invite of Object.values(this.state.invites)) {
      if (invite.status === "pending" && (invite.expiresAt <= now || !this.active(invite.from, now) || !this.active(invite.to, now))) invite.status = "expired";
      if (invite.expiresAt + 120_000 < now) delete this.state.invites[invite.id];
    }
    for (const person of Object.values(this.state.people)) if (now - person.lastSeen > PRESENCE_MS) delete this.state.people[person.id];
  }
  private active(id: string, now: number) { const person = this.state.people[id]; return person && now - person.lastSeen <= PRESENCE_MS; }
  private pending(person: Participant) { return person.inviteId ? this.state.invites[person.inviteId]?.status === "pending" : false; }
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
    return { self: this.publicPeer(person), peers: Object.values(this.state.people).filter(peer => peer.accountId !== person.accountId && !peer.ticket && !this.blocked(person.accountId, peer.accountId)).map(peer => this.publicPeer(peer)), invite: person.inviteId ? this.state.invites[person.inviteId] ?? null : null, ticket: person.ticket, serverTime: Date.now() };
  }
  private async save() {
    await this.ctx.storage.put("area", this.state);
    if (Object.keys(this.state.people).length || Object.keys(this.state.invites).length || Object.keys(this.state.rooms).length || this.state.closingRooms.length) await this.ctx.storage.setAlarm(Date.now() + 5000);
  }
  async alarm() { await this.ctx.blockConcurrencyWhile(async () => { this.sweep(Date.now()); await this.closeBlockedRooms(); await this.save(); }); }
  async fetch(request: Request): Promise<Response> {
    // Serialize the accept + room allocation across awaits: only one accept wins.
    return this.ctx.blockConcurrencyWhile(async () => {
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
        for (const peer of Object.values(this.state.people)) if (peer.accountId === body.accountId && (!sessionHash || peer.sessionHash === sessionHash)) {
          const invite = peer.inviteId && this.state.invites[peer.inviteId];
          if (invite && invite.status === "pending") invite.status = "cancelled";
          delete this.state.people[peer.id];
        }
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
        for (const invite of Object.values(this.state.invites)) {
          const from = this.state.people[invite.from]?.accountId, to = this.state.people[invite.to]?.accountId;
          if (invite.status === "pending" && ((from === actor && to === targetAccount) || (to === actor && from === targetAccount))) invite.status = "cancelled";
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
        const person: Participant = { id, token, accountId, sessionHash: await digestSession(request.headers.get("X-Account-Token") ?? ""), alias: `听众 ${id.slice(0, 4).toUpperCase()}`, trackId: body.trackId as string, lastSeen: now, lastInvite: 0, inviteId: null, ticket: null, pairs: {} };
        this.state.people[id] = person; await this.save();
        return reply({ token, ...this.snapshot(person) }, 201);
      }
      const bearer = request.headers.get("Authorization");
      const person = Object.values(this.state.people).find(peer => bearer === `Bearer ${peer.token}` && peer.accountId === request.headers.get("X-Account-Id"));
      if (!person) return fail("SESSION_EXPIRED", 401);
      if (action === "state" && request.method === "GET") { person.lastSeen = now; await this.save(); return reply(this.snapshot(person)); }
      if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
      if (action === "stop") {
        const invite = person.inviteId && this.state.invites[person.inviteId];
        if (invite && invite.status === "pending") invite.status = "cancelled";
        delete this.state.people[person.id]; await this.save(); return reply({ ok: true });
      }
      person.lastSeen = now;
      if (action === "track") {
        if (!audioTracks.some(track => track.id === body.trackId)) return fail("INVALID_TRACK", 400);
        const invite = person.inviteId && this.state.invites[person.inviteId];
        if (invite && invite.status === "pending") invite.status = "cancelled";
        person.trackId = body.trackId as string;
      } else if (action === "invite") {
        const target = typeof body.targetId === "string" && UUID_PATTERN.test(body.targetId) ? this.state.people[body.targetId] : null;
        if (!target || target.accountId === person.accountId || target.ticket || this.blocked(person.accountId, target.accountId)) return fail("UNAVAILABLE");
        if (person.ticket || this.pending(person) || this.pending(target)) return fail("BUSY");
        if (now - person.lastInvite < 15_000 || now - (person.pairs[target.id] ?? 0) < 60_000 || now - (target.pairs[person.id] ?? 0) < 60_000) return fail("COOLDOWN", 429);
        const invite: NearbyInvite = { id: crypto.randomUUID(), from: person.id, to: target.id, fromAlias: person.alias, toAlias: target.alias, trackId: target.trackId, expiresAt: now + INVITE_MS, status: "pending" };
        this.state.invites[invite.id] = invite;
        person.inviteId = target.inviteId = invite.id; person.lastInvite = now; person.pairs[target.id] = now;
      } else if (action === "respond") {
        const invite = typeof body.inviteId === "string" ? this.state.invites[body.inviteId] : null;
        if (!invite || invite.status !== "pending") return fail("INVITE_EXPIRED");
        if (body.decision === "cancel" && invite.from === person.id) invite.status = "cancelled";
        else if ((body.decision === "accept" || body.decision === "decline") && invite.to === person.id) {
          if (body.decision === "decline") invite.status = "declined";
          else {
            const sender = this.state.people[invite.from];
            if (!sender || sender.ticket || person.ticket || this.blocked(person.accountId, sender.accountId)) return fail("UNAVAILABLE");
            const roomId = crypto.randomUUID();
            const response = await this.env.ROOMS.get(this.env.ROOMS.idFromName(roomId)).fetch(new Request("https://room.internal/init", { method: "POST", body: JSON.stringify({ id: roomId, trackId: invite.trackId, nearby: true, accounts: { host: person.accountId, guest: sender.accountId } }) }));
            if (!response.ok) return fail("CONNECT_FAILED", 503);
            const room = await response.json<{ hostToken: string; guestToken: string }>();
            this.state.rooms[roomId] = { host: person.accountId, guest: sender.accountId, hostAlias: person.alias, guestAlias: sender.alias, expiresAt: now + ROOM_LIFETIME_MS };
            // The listener whose song was selected leads playback, the inviter follows.
            person.ticket = { roomId, token: room.hostToken };
            sender.ticket = { roomId, token: room.guestToken };
            invite.status = "accepted";
          }
        } else return fail("FORBIDDEN", 403);
      } else return fail("NOT_FOUND", 404);
      await this.save(); return reply(this.snapshot(person));
    });
  }
}
