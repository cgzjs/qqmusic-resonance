import { DurableObject } from "cloudflare:workers";
import { audioTracks } from "../lib/resonance/demo-data";
import { catalogVersion, findCatalogTrack } from "../lib/resonance/catalog";
import { deliverExchange, transitionExchange, type ExchangeCommand, type ExchangeOutbox } from "../lib/resonance/exchange-protocol";
import { REACTION_COOLDOWN_MS, REACTION_TTL_MS, type RoomReaction } from "../lib/resonance/room-protocol";
import { applyRoomCommand, HEARTBEAT_TIMEOUT_MS, parseRoomMessage, playbackPosition, settledPlayback, RECONNECT_GRACE_MS, ROOM_LIFETIME_MS, type RoomRole, type RoomSnapshot } from "../lib/resonance/room-protocol";

const durations = Object.fromEntries(audioTracks.map(track => [track.id, track.duration]));
type PeerSlot = { clientId: string | null; disconnectedAt: number | null };
type RoomRecord = Omit<RoomSnapshot, "hostConnected" | "guestConnected"> & {
  hostToken: string;
  guestToken: string;
  nearby?: boolean;
  accounts?: Record<RoomRole, string>;
  slots: Record<RoomRole, PeerSlot>;
  commands: Record<RoomRole, string[]>;
  reactions?: { event: RoomReaction; recipientClientId: string; received: boolean }[];
  lastReactionAt?: Partial<Record<RoomRole, number>>;
  exchangeCommands?: { role: RoomRole; command: ExchangeCommand }[];
  exchangeIds?: string[];
  exchangeOutbox?: ExchangeOutbox[];
};
type Attachment = { role: RoomRole | null; clientId: string | null; lastSeen: number; commandTimes: number[]; accountToken?: string };

export class ListeningRoom extends DurableObject<Cloudflare.Env> {
  private room: RoomRecord | null = null;
  private flushingExchanges = false;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomRecord>("room") ?? null;
      if (this.room && !this.room.closed && (!audioTracks.some(track => track.id === this.room!.playback.trackId) || (this.room.catalogVersion && this.room.catalogVersion !== catalogVersion))) {
        await this.closeRoom(); return;
      }
      if (this.room && !this.room.catalogVersion) { this.room.catalogVersion = catalogVersion; await this.persist(); }
      // Hibernation preserves sockets; a process restart may not. Reserve lost
      // seats rather than allowing another client to take over immediately.
      let lostConnection = false;
      if (this.room) for (const role of ["host", "guest"] as const) {
        const slot = this.room.slots[role];
        if (slot.clientId && slot.disconnectedAt === null && this.peers(role).length === 0) {
          slot.disconnectedAt = Date.now(); lostConnection = true;
        }
      }
      if (lostConnection && this.room) { this.pausePlayback(); this.room.revision++; await this.persist(); }
    });
  }

  private peers(role?: RoomRole): WebSocket[] {
    return this.ctx.getWebSockets().filter(socket => socket.readyState === 1 && this.attachment(socket)?.role && (!role || this.attachment(socket)?.role === role));
  }
  private attachment(socket: WebSocket): Attachment | null {
    try { return socket.deserializeAttachment() as Attachment | null; } catch { return null; }
  }
  private snapshot(): RoomSnapshot {
    const room = this.room!;
    return { id: room.id, revision: room.revision, expiresAt: room.expiresAt, closed: room.closed, hostConnected: this.peers("host").length > 0, guestConnected: this.peers("guest").length > 0, playback: settledPlayback(room.playback, Date.now(), this.trackDuration()), exchange: room.exchange ?? null, exchangeEnabled: !!room.accounts && audioTracks.length >= 2, catalogVersion: room.catalogVersion };
  }
  private trackDuration() { return findCatalogTrack(this.room?.playback.trackId)?.duration ?? Math.max(1, this.room?.playback.position ?? 0); }
  private send(socket: WebSocket, payload: object) {
    try { socket.send(JSON.stringify(payload)); } catch { /* Close/error events handle disconnected peers. */ }
  }
  private broadcast() {
    if (!this.room) return;
    const payload = { type: "state", room: this.snapshot(), serverTime: Date.now() };
    for (const socket of this.peers()) this.send(socket, payload);
  }
  private async persist() {
    if (this.room) await this.ctx.storage.put("room", this.room);
    await this.scheduleAlarm();
  }
  private async scheduleAlarm() {
    if (!this.room) return;
    const deliveries = (this.room.exchangeOutbox ?? []).map(item => item.nextAttemptAt);
    if (this.room.closed) {
      if (deliveries.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 100, Math.min(...deliveries)));
      return;
    }
    const deadlines = [this.room.expiresAt];
    deadlines.push(...deliveries);
    if (this.room.exchange?.status === "pending") deadlines.push(this.room.exchange.expiresAt);
    for (const slot of Object.values(this.room.slots)) if (slot.disconnectedAt !== null) deadlines.push(slot.disconnectedAt + RECONNECT_GRACE_MS);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== 1) continue;
      const data = this.attachment(socket);
      if (data) deadlines.push(data.lastSeen + (data.role ? HEARTBEAT_TIMEOUT_MS : 10_000));
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 100, Math.min(...deadlines)));
  }
  private pausePlayback() {
    if (!this.room) return;
    this.room.playback = { ...this.room.playback, position: playbackPosition(this.room.playback, Date.now(), this.trackDuration()), playing: false, updatedAt: Date.now() };
  }
  private async closeRoom() {
    if (!this.room || this.room.closed) return;
    if (this.room.exchange?.status === "pending") this.room.exchange.status = "ended";
    this.room.closed = true; this.room.revision++; this.pausePlayback(); this.broadcast();
    for (const socket of this.ctx.getWebSockets()) {
      socket.serializeAttachment(null);
      try { socket.close(4004, "ROOM_CLOSED"); } catch { /* Already closed. */ }
    }
    if (this.room.exchangeOutbox?.length) await this.persist();
    else await this.clearRoomStorage();
  }

  private async clearRoomStorage() {
    await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); this.room = null;
  }

  private expireExchange() {
    if (this.room?.exchange?.status === "pending" && Date.now() >= this.room.exchange.expiresAt) {
      this.room.exchange.status = "expired"; this.room.revision++; return true;
    }
    return false;
  }

  private async flushExchangeOutbox() {
    if (!this.room || this.flushingExchanges) return;
    const room = this.room;
    const due = (room.exchangeOutbox ?? []).filter(item => item.nextAttemptAt <= Date.now());
    if (!due.length) return;
    this.flushingExchanges = true;
    try {
      const delivered = await Promise.all(due.map(item => deliverExchange(item, room.id, Date.now(), async (accountId, record) => {
        const response = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName(accountId)).fetch(new Request("https://account.internal/record-exchange", { method: "POST", body: JSON.stringify({ accountId, record }), signal: AbortSignal.timeout(5000) }));
        return response.ok;
      })));
      if (this.room !== room) return;
      const byId = new Map(delivered.map(item => [item.exchange.id, item]));
      room.exchangeOutbox = (room.exchangeOutbox ?? []).map(item => byId.get(item.exchange.id) ?? item);
      const current = room.exchange && byId.get(room.exchange.id);
      if (current && room.exchange) room.exchange.saved = { ...current.saved };
      room.exchangeOutbox = room.exchangeOutbox.filter(item => !item.saved.host || !item.saved.guest);
      room.revision++;
      if (room.closed && !room.exchangeOutbox.length) await this.clearRoomStorage();
      else { await this.persist(); this.broadcast(); }
    } finally { this.flushingExchanges = false; }
  }

  private async exchangeCommand(socket: WebSocket, role: RoomRole, command: ExchangeCommand) {
    if (!this.room || this.room.closed) return;
    const room = this.room;
    const reply = (error?: string) => this.send(socket, { type: "exchange-result", requestId: command.id, error, room: this.snapshot(), serverTime: Date.now() });
    if (!room.accounts) { reply("EXCHANGE_ACCOUNT_REQUIRED"); return; }
    if (audioTracks.length < 2) { reply("EXCHANGE_CATALOG_UNAVAILABLE"); return; }
    const cached = room.exchangeCommands?.find(item => item.command.id === command.id);
    if (cached) { reply(cached.role === role && JSON.stringify(cached.command) === JSON.stringify(command) ? undefined : "EXCHANGE_CONFLICT"); return; }
    if (command.action === "offer" && (room.exchangeIds?.includes(command.id) || (room.exchangeIds?.length ?? 0) >= 100 || (room.exchangeOutbox?.length ?? 0) >= 10)) { reply("EXCHANGE_LIMIT"); return; }
    const result = transitionExchange(room.exchange ?? null, role, command, Date.now(), this.peers("host").length > 0 && this.peers("guest").length > 0, audioTracks.map(track => track.id));
    if (result.error) { reply(result.error); return; }
    room.exchange = result.exchange!;
    if (command.action === "offer") room.exchangeIds = [...(room.exchangeIds ?? []), command.id];
    if (room.exchange.status === "completed") room.exchangeOutbox = [...(room.exchangeOutbox ?? []), { exchange: { ...room.exchange, saved: { ...room.exchange.saved } }, accounts: { ...room.accounts }, saved: { host: false, guest: false }, attempts: 0, nextAttemptAt: Date.now() }];
    room.exchangeCommands = [...(room.exchangeCommands ?? []), { role, command }].slice(-128);
    room.revision++;
    await this.persist();
    if (this.room !== room) return;
    reply(); this.broadcast();
    if (room.exchangeOutbox?.length) this.ctx.waitUntil(this.flushExchangeOutbox());
  }

  async fetch(request: Request): Promise<Response> {
    // Internal-only route: never forwarded by the public worker router.
    if (new URL(request.url).pathname === "/close-for-block" && request.method === "POST") {
      return this.ctx.blockConcurrencyWhile(async () => {
        const { host, guest } = await request.json<{ host: string; guest: string }>();
        if (!this.room) return Response.json({ ok: true });
        if (this.room.accounts?.host !== host || this.room.accounts?.guest !== guest) return Response.json({ error: "FORBIDDEN" }, { status: 403 });
        await this.closeRoom();
        return Response.json({ ok: true });
      });
    }
    if (new URL(request.url).pathname === "/init" && request.method === "POST") {
      if (this.room) return Response.json({ error: "ROOM_EXISTS" }, { status: 409 });
      const { id, trackId, nearby, accounts } = await request.json<{ id: string; trackId: string; nearby?: boolean; accounts?: Record<RoomRole, string> }>();
      const now = Date.now();
      this.room = { id, revision: 0, expiresAt: now + ROOM_LIFETIME_MS, closed: false, playback: { trackId, position: 0, playing: false, updatedAt: now }, hostToken: crypto.randomUUID(), guestToken: crypto.randomUUID(), slots: { host: { clientId: null, disconnectedAt: now }, guest: { clientId: null, disconnectedAt: null } }, commands: { host: [], guest: [] } };
      this.room.nearby = nearby === true;
      this.room.catalogVersion = catalogVersion;
      this.room.accounts = accounts;
      await this.persist();
      return Response.json({ roomId: id, hostToken: this.room.hostToken, ...(nearby ? { guestToken: this.room.guestToken } : {}), expiresAt: this.room.expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (!this.room || this.room.closed || Date.now() >= this.room.expiresAt) return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (new URL(request.url).pathname.endsWith("/status")) return Response.json({ active: true }, { headers: { "Cache-Control": "no-store" } });
    if (this.ctx.getWebSockets().filter(socket => socket.readyState === 1).length >= 4) return Response.json({ error: "ROOM_BUSY" }, { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, clientId: null, lastSeen: Date.now(), commandTimes: [] } satisfies Attachment);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (!this.room || this.room.closed || Date.now() >= this.room.expiresAt) { await this.closeRoom(); return; }
    if (typeof raw !== "string" || raw.length > 4096) { socket.close(1009, "MESSAGE_TOO_LARGE"); return; }
    const message = parseRoomMessage(raw);
    const data = this.attachment(socket);
    if (!message || !data) { socket.close(4002, "INVALID_MESSAGE"); return; }
    // Handle leaving before async auth, so the following close cannot hide it.
    if (message.type === "leave" && data.role) { await this.disconnect(socket, true); return; }
    if (this.room.accounts) {
      const roomBeforeAuth = this.room;
      const role = data.role ?? (message.type === "hello" ? message.token === this.room.hostToken ? "host" : message.token === this.room.guestToken ? "guest" : null : null);
      const accountToken = message.type === "hello" ? message.accountToken : data.accountToken;
      if (!role || !accountToken) { socket.close(4001, "AUTH_REQUIRED"); return; }
      const authorized = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName(this.room.accounts[role])).fetch(new Request("https://account.internal/auth", { headers: { "X-Account-Token": accountToken } }));
      if (this.room !== roomBeforeAuth || !this.room) return;
      if (!authorized.ok) { await this.closeRoom(); return; }
      if (socket.readyState !== 1) return;
      data.accountToken = accountToken;
    }
    const now = Date.now();
    if (this.expireExchange()) { await this.persist(); this.broadcast(); }
    if (!this.room || this.room.closed || Date.now() >= this.room.expiresAt) { await this.closeRoom(); return; }
    data.lastSeen = now;
    if (!data.role) {
      if (message.type !== "hello") { socket.close(4001, "AUTH_REQUIRED"); return; }
      const role = message.token === this.room.hostToken ? "host" : message.token === this.room.guestToken ? "guest" : null;
      if (!role) { socket.close(4001, "INVALID_TOKEN"); return; }
      const slot = this.room.slots[role];
      const occupied = this.peers(role);
      if (slot.clientId && slot.clientId !== message.clientId && (occupied.length > 0 || (slot.disconnectedAt !== null && now - slot.disconnectedAt < RECONNECT_GRACE_MS))) { socket.close(4003, "ROOM_FULL"); return; }
      for (const old of occupied) { old.serializeAttachment(null); old.close(4005, "REPLACED"); }
      socket.serializeAttachment({ ...data, role, clientId: message.clientId });
      this.room.slots[role] = { clientId: message.clientId, disconnectedAt: null };
      this.room.revision++;
      await this.persist();
      this.send(socket, { type: "welcome", role, room: this.snapshot(), serverTime: Date.now(), ...(role === "host" && !this.room.nearby ? { invitationToken: this.room.guestToken } : {}) });
      this.broadcast();
      return;
    }
    socket.serializeAttachment(data);
    if (message.type === "ping") {
      this.send(socket, { type: "state", room: this.snapshot(), serverTime: Date.now(), sentAt: message.sentAt });
      await this.scheduleAlarm(); return;
    }
    if (message.type === "leave") { await this.disconnect(socket, true); return; }
    if (message.type === "exchange") {
      const otherRole = data.role === "host" ? "guest" : "host";
      const other = this.peers(otherRole)[0];
      if (this.room.accounts && other && ["offer", "respond"].includes(message.action)) {
        const before = this.room;
        const valid = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName(before.accounts![otherRole])).fetch(new Request("https://account.internal/auth", { headers: { "X-Account-Token": this.attachment(other)?.accountToken ?? "" } }));
        if (this.room !== before || !this.room || this.room.closed || socket.readyState !== 1) return;
        if (!valid.ok) { await this.closeRoom(); return; }
      }
      data.commandTimes = data.commandTimes.filter(time => Date.now() - time < 5000);
      if (data.commandTimes.length >= 20) { this.send(socket, { type: "exchange-result", requestId: message.id, error: "RATE_LIMIT", room: this.snapshot(), serverTime: Date.now() }); return; }
      data.commandTimes.push(Date.now()); socket.serializeAttachment(data);
      await this.exchangeCommand(socket, data.role, message); return;
    }
    if (message.type === "reaction-received") {
      const delivery = this.room.reactions?.find(item => item.event.id === message.id && item.event.from !== data.role && item.recipientClientId === data.clientId);
      if (!delivery || delivery.received || now - delivery.event.createdAt > REACTION_TTL_MS) return;
      delivery.received = true;
      await this.persist();
      for (const sender of this.peers(delivery.event.from)) this.send(sender, { type: "reaction-status", id: delivery.event.id, status: "received" });
      return;
    }
    if (message.type === "reaction") {
      const fail = (error: string) => this.send(socket, { type: "reaction-status", id: message.id, status: "failed", error });
      const previous = this.room.reactions?.find(item => item.event.id === message.id && item.event.from === data.role);
      if (previous) {
        this.send(socket, { type: "reaction-status", id: message.id, status: previous.received ? "received" : now - previous.event.createdAt <= REACTION_TTL_MS ? "sent" : "failed", error: "DELIVERY_UNCONFIRMED" });
        return;
      }
      if (now - message.sentAt > REACTION_TTL_MS || message.sentAt - now > 1500) { fail("REACTION_EXPIRED"); return; }
      if (message.trackId !== this.room.playback.trackId) { fail("TRACK_CHANGED"); return; }
      if (now - (this.room.lastReactionAt?.[data.role] ?? 0) < REACTION_COOLDOWN_MS) { fail("RATE_LIMIT"); return; }
      const recipient = this.peers(data.role === "host" ? "guest" : "host")[0];
      const recipientData = recipient && this.attachment(recipient);
      if (!recipient || !recipientData?.clientId) { fail("PEER_OFFLINE"); return; }
      const event: RoomReaction = { id: message.id, kind: message.kind, from: data.role, trackId: message.trackId, createdAt: now };
      this.room.lastReactionAt = { ...this.room.lastReactionAt, [data.role]: now };
      this.room.reactions = [...(this.room.reactions ?? []), { event, recipientClientId: recipientData.clientId, received: false }].slice(-64);
      await this.persist();
      if (recipient.readyState !== 1) { fail("PEER_OFFLINE"); return; }
      this.send(socket, { type: "reaction-status", id: message.id, status: "sent" });
      this.send(recipient, { type: "reaction", event, serverTime: Date.now() });
      return;
    }
    if (message.type !== "command") { socket.close(4002, "INVALID_MESSAGE"); return; }
    data.commandTimes = data.commandTimes.filter(time => now - time < 5000);
    if (data.commandTimes.length >= 20) { this.send(socket, { type: "error", error: "RATE_LIMIT" }); return; }
    data.commandTimes.push(now); socket.serializeAttachment(data);
    if (this.room.commands[data.role].includes(message.id)) { this.send(socket, { type: "state", room: this.snapshot(), serverTime: now }); return; }
    const result = applyRoomCommand(this.snapshot(), data.role, message, now, durations);
    if (!result.ok) {
      this.send(socket, { type: "error", error: result.error });
      this.send(socket, { type: "state", room: this.snapshot(), serverTime: now }); return;
    }
    this.room.playback = result.playback;
    this.room.revision++;
    this.room.commands[data.role] = [...this.room.commands[data.role], message.id].slice(-32);
    await this.persist(); this.broadcast();
  }

  private async disconnect(socket: WebSocket, explicit: boolean) {
    const data = this.attachment(socket);
    socket.serializeAttachment(null);
    if (!this.room || !data?.role) return;
    if (explicit && (data.role === "host" || this.room.nearby)) { await this.closeRoom(); return; }
    this.room.slots[data.role] = { clientId: explicit ? null : data.clientId, disconnectedAt: explicit ? null : Date.now() };
    this.pausePlayback(); this.room.revision++;
    try { socket.close(1000, "LEFT_ROOM"); } catch { /* Already closed. */ }
    await this.persist(); this.broadcast();
  }
  async webSocketClose(socket: WebSocket) { await this.disconnect(socket, false); }
  async webSocketError(socket: WebSocket) { await this.disconnect(socket, false); }
  async alarm() {
    if (!this.room) return;
    await this.flushExchangeOutbox();
    if (!this.room) return;
    if (this.room.closed) { await this.scheduleAlarm(); return; }
    if (this.expireExchange()) { await this.persist(); this.broadcast(); }
    const now = Date.now();
    if (now >= this.room.expiresAt || (this.room.slots.host.disconnectedAt !== null && now - this.room.slots.host.disconnectedAt >= RECONNECT_GRACE_MS)) { await this.closeRoom(); return; }
    for (const socket of this.ctx.getWebSockets()) {
      const data = this.attachment(socket);
      if (data && now - data.lastSeen >= (data.role ? HEARTBEAT_TIMEOUT_MS : 10_000)) {
        if (data.role) await this.disconnect(socket, false);
        else { socket.serializeAttachment(null); socket.close(4001, "AUTH_TIMEOUT"); }
      }
    }
    const guest = this.room?.slots.guest;
    if (guest?.disconnectedAt !== null && guest?.disconnectedAt !== undefined && now - guest.disconnectedAt >= RECONNECT_GRACE_MS) {
      this.room!.slots.guest = { clientId: null, disconnectedAt: null };
      this.room!.revision++;
    }
    await this.persist(); this.broadcast();
  }
}
