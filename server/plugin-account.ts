import { DurableObject } from "cloudflare:workers";
import { audioTracks, playableListeners } from "../lib/resonance/demo-data";
import { parseLibrary } from "../lib/resonance/library";
import type { OnlineExchangeRecord } from "../lib/resonance/exchange-protocol";
import { UUID_PATTERN } from "../lib/resonance/room-protocol";
import { emptyAccountData, type AccountData } from "../lib/resonance/host-protocol";
import { receivedSongs } from "../lib/resonance/received-songs";
import type { DemoReply } from "../lib/resonance/demo-reply";
import { DEMO_RESPONSE_MS } from "../lib/resonance/demo-motion";
type RecordData = { accountId: string; displayName: string; deviceHash: string; sessions: { hash: string; expiresAt: number }[]; data: AccountData };
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");

export class PluginAccount extends DurableObject<Cloudflare.Env> {
  private record: RecordData | null = null;
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.record = await ctx.storage.get<RecordData>("account") ?? null;
      if (this.record) {
        this.record.data.listenLaterIds ??= [];
        this.record.data.events ??= [];
        this.record.data.onlineExchanges ??= [];
        // Existing history remains accessible, without turning every old exchange into a new alert.
        if (!this.record.data.readExchangeIds) {
          this.record.data.readExchangeIds = receivedSongs(this.record.data).map(item => item.id);
          await this.ctx.storage.put("account", this.record);
        }
        this.record.data.demoReplies ??= [];
        await this.settleReplies();
      }
    });
  }
  private async settleReplies() {
    if (!this.record) return;
    const now = Date.now();
    let changed = false;
    for (const item of this.record.data.demoReplies) {
      if (item.status !== "pending" || item.dueAt > now) continue;
      if (item.event && !this.record.data.events.some(event => event.id === item.id)) {
        this.record.data.events = [...this.record.data.events, { ...item.event, createdAt: new Date(item.dueAt).toISOString() }].slice(-300);
      }
      item.status = "ready"; changed = true;
    }
    if (changed) await this.ctx.storage.put("account", this.record);
    const pending = this.record.data.demoReplies.filter(item => item.status === "pending");
    if (pending.length) await this.ctx.storage.setAlarm(Math.min(...pending.map(item => item.dueAt)));
  }
  async alarm() { await this.ctx.blockConcurrencyWhile(() => this.settleReplies()); }
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const action = new URL(request.url).pathname.split("/").pop();
      const reply = (value: object, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
      let body: Record<string, unknown> = {};
      if (request.method === "POST") {
        try { body = await request.json(); } catch { return reply({ error: "INVALID_BODY" }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "INVALID_BODY" }, 400);
      }
      if (action === "init" && !this.record) {
        const deviceKey = crypto.randomUUID();
        this.record = { accountId: body.accountId as string, displayName: body.displayName as string, deviceHash: await digest(deviceKey), sessions: [], data: structuredClone(emptyAccountData) };
        await this.ctx.storage.put("account", this.record);
        return reply({ accountId: this.record.accountId, deviceKey }, 201);
      }
      if (!this.record) return reply({ error: "ACCOUNT_UNAVAILABLE" }, 401);
      // Only another Worker binding can reach this internal route. The public
      // /api/host allowlist never forwards record-exchange.
      if (action === "record-exchange" && request.method === "POST") {
        const item = body.record as OnlineExchangeRecord | undefined;
        if (body.accountId !== this.record.accountId || !item || !UUID_PATTERN.test(item.id ?? "") || !UUID_PATTERN.test(item.roomId ?? "") || !Number.isFinite(item.completedAt) || typeof item.sentTrackId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.sentTrackId) || typeof item.receivedTrackId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.receivedTrackId) || item.sentTrackId === item.receivedTrackId) return reply({ error: "INVALID_EXCHANGE" }, 400);
        const key = `exchange:${item.roomId}:${item.id}`;
        if (await this.ctx.storage.get(key)) return reply({ saved: true });
        const record: OnlineExchangeRecord = { id: item.id, roomId: item.roomId, sentTrackId: item.sentTrackId, receivedTrackId: item.receivedTrackId, completedAt: item.completedAt };
        const next = { ...this.record, data: { ...this.record.data, onlineExchanges: [...this.record.data.onlineExchanges, record].slice(-100) } };
        await this.ctx.storage.transaction(async transaction => { await transaction.put("account", next); await transaction.put(key, true); });
        this.record = next;
        return reply({ saved: true });
      }
      if (action === "resume" && request.method === "POST") {
        if (typeof body.deviceKey !== "string" || await digest(body.deviceKey) !== this.record.deviceHash) return reply({ error: "AUTH_REQUIRED" }, 401);
        const token = crypto.randomUUID(), expiresAt = Date.now() + 2 * 60 * 60 * 1000;
        this.record.sessions = [...this.record.sessions.filter(session => session.expiresAt > Date.now()).slice(-7), { hash: await digest(token), expiresAt }];
        await this.ctx.storage.put("account", this.record);
        return reply({ accountId: this.record.accountId, displayName: this.record.displayName, token, expiresAt, mode: "demo" });
      }
      const token = request.headers.get("X-Account-Token") ?? "";
      const hash = await digest(token);
      if (!this.record.sessions.some(session => session.hash === hash && session.expiresAt > Date.now())) return reply({ error: "AUTH_EXPIRED" }, 401);
      if (action === "auth") return reply({ accountId: this.record.accountId, displayName: this.record.displayName });
      if (action === "logout" && request.method === "POST") {
        if (body.scope !== undefined && body.scope !== "session") return reply({ error: "INVALID_SCOPE" }, 400);
        this.record.sessions = body.scope === "session" ? this.record.sessions.filter(session => session.hash !== hash) : [];
        await this.ctx.storage.put("account", this.record); return reply({ ok: true });
      }
      if (action === "data") await this.settleReplies();
      if (action === "data" && request.method === "GET") return reply(this.record.data);
      if (action === "data" && request.method === "POST") {
        if (body.action === "claimReply") {
          const item = this.record.data.demoReplies.find(item => item.id === body.id && item.status === "ready");
          if (!item || item.notified) return reply({ claimed: false, data: this.record.data });
          item.notified = true;
          await this.ctx.storage.put("account", this.record);
          return reply({ claimed: true, reply: item, data: this.record.data });
        }
        if (["queueExchange", "queueWave", "queueHeart"].includes(String(body.action))) {
          if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id) || typeof body.trackId !== "string") return reply({ error: "INVALID_REPLY" }, 400);
          const kind: DemoReply["kind"] = body.action === "queueExchange" ? "exchange" : body.action === "queueWave" ? "wave" : "heart";
          const signature = JSON.stringify([kind, body.trackId, kind === "exchange" ? body.event : null]);
          const key = `demo-reply:${body.id}`;
          const prior = await this.ctx.storage.get<string>(key);
          if (prior) return prior === signature ? reply(this.record.data) : reply({ error: "REPLY_CONFLICT" }, 409);
          if (!audioTracks.some(track => track.id === body.trackId)) return reply({ error: "INVALID_TRACK" }, 400);
          if (this.record.data.demoReplies.some(item => item.status === "pending" && (item.kind === "exchange") === (kind === "exchange"))) return reply({ error: "REPLY_PENDING" }, 409);
          let event;
          if (kind === "exchange") {
            event = parseLibrary(JSON.stringify({ version: 1, events: [body.event] }), new Set(audioTracks.map(track => track.id)), new Set(playableListeners.map(listener => listener.id))).events[0];
            if (!event || event.type !== "exchange" || event.id !== body.id || event.trackId !== body.trackId) return reply({ error: "INVALID_EVENT" }, 400);
          }
          const item: DemoReply = { id: body.id, kind, trackId: body.trackId, dueAt: Date.now() + DEMO_RESPONSE_MS, status: "pending", notified: false, ...(event ? { event } : {}) };
          // Retain unclaimed replies; refuse new work instead of silently dropping a notification.
          const kept = this.record.data.demoReplies.filter(item => !item.notified);
          if (kept.length >= 64) return reply({ error: "REPLY_LIMIT" }, 429);
          const next = { ...this.record, data: { ...this.record.data, demoReplies: [...kept, item] } };
          await this.ctx.storage.transaction(async transaction => { await transaction.put("account", next); await transaction.put(key, signature); await transaction.setAlarm(Math.min(item.dueAt, ...kept.filter(item => item.status === "pending").map(item => item.dueAt))); });
          this.record = next;
          return reply(this.record.data);
        }
        if (body.action === "readExchange") {
          const items = receivedSongs(this.record.data);
          if (typeof body.id !== "string" || !items.some(item => item.id === body.id)) return reply({ error: "EXCHANGE_NOT_FOUND" }, 404);
          const retained = new Set(items.map(item => item.id));
          this.record.data.readExchangeIds = [...new Set([...this.record.data.readExchangeIds.filter(id => retained.has(id)), body.id])];
          await this.ctx.storage.put("account", this.record); return reply(this.record.data);
        }
        if ((body.action === "unfavorite" || body.action === "removeLater") && typeof body.trackId === "string") {
          if (body.action === "unfavorite") this.record.data.favoriteIds = this.record.data.favoriteIds.filter(id => id !== body.trackId);
          else this.record.data.listenLaterIds = this.record.data.listenLaterIds.filter(id => id !== body.trackId);
          await this.ctx.storage.put("account", this.record); return reply(this.record.data);
        }
        if (!audioTracks.some(track => track.id === body.trackId)) return reply({ error: "INVALID_TRACK" }, 400);
        const trackId = body.trackId as string;
        if (body.action === "favorite") {
          this.record.data.favoriteIds = [...new Set([...this.record.data.favoriteIds, trackId])];
          this.record.data.listenLaterIds = this.record.data.listenLaterIds.filter(id => id !== trackId);
        }
        else if (body.action === "unfavorite") this.record.data.favoriteIds = this.record.data.favoriteIds.filter(id => id !== trackId);
        else if (body.action === "later") {
          if (!this.record.data.favoriteIds.includes(trackId)) this.record.data.listenLaterIds = [...new Set([...this.record.data.listenLaterIds, trackId])];
        }
        else if (body.action === "removeLater") this.record.data.listenLaterIds = this.record.data.listenLaterIds.filter(id => id !== trackId);
        else if (body.action === "event") {
          const library = parseLibrary(JSON.stringify({ version: 1, events: [body.event] }), new Set(audioTracks.map(track => track.id)), new Set(playableListeners.map(listener => listener.id)));
          const event = library.events[0];
          if (!event || event.trackId !== trackId || event.id.length > 100) return reply({ error: "INVALID_EVENT" }, 400);
          if (!this.record.data.events.some(item => item.id === event.id)) this.record.data.events = [...this.record.data.events, { ...event, createdAt: new Date().toISOString() }].slice(-300);
        }
        else if (body.action === "listen" && typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
          if (!this.record.data.history.some(event => event.id === body.id)) this.record.data.history = [...this.record.data.history, { id: body.id, trackId, listenedAt: Date.now() }].slice(-100);
        } else return reply({ error: "INVALID_ACTION" }, 400);
        await this.ctx.storage.put("account", this.record); return reply(this.record.data);
      }
      return reply({ error: "NOT_FOUND" }, 404);
    });
  }
}
