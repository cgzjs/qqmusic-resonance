import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const folder = path.resolve("node_modules/.cache/listener-blocking");
await mkdir(folder, { recursive: true });
const output = path.join(folder, `area-${process.pid}.mjs`);
await build({ entryPoints: ["server/nearby-area.ts"], bundle: true, platform: "node", format: "esm", outfile: output,
  plugins: [{ name: "cloudflare-test-boundary", setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "durable", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" }));
  } }],
});
after(() => unlink(output));
const { NearbyArea } = await import(pathToFileURL(output));
function context(storage) {
  let pending = Promise.resolve();
  return {
    storage: { get: async key => structuredClone(storage.get(key)), put: async (key, value) => storage.set(key, structuredClone(value)), setAlarm: async at => storage.set("alarm", at) },
    blockConcurrencyWhile(fn) { const next = pending.then(fn); pending = next.catch(() => {}); return next; },
  };
}
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", roomId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reqAs = (account, action, body, token) => new Request(`https://nearby.internal/${action}`, { method: body ? "POST" : "GET", headers: { "X-Account-Id": account, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const req = (action, body) => new Request(`https://nearby.internal/${action}`, { method: body ? "POST" : "GET", headers: { "X-Account-Id": a }, ...(body ? { body: JSON.stringify(body) } : {}) });

test("legacy area state drops old invitations and keeps a private empty block list", async () => {
  const storage = new Map([["area", { people: {}, invites: { old: { id: "old", status: "cancelled", expiresAt: Date.now() } } }]]);
  const area = new NearbyArea(context(storage), {});
  assert.deepEqual(await (await area.fetch(req("blocks"))).json(), { blocks: [] });
  await area.fetch(req("unblock", { id: b }));
  assert.equal(storage.get("area").invites, undefined);
  assert.deepEqual(storage.get("area").closingRooms, []);
});

test("failed room closure is saved with the block and retried after object restart", async () => {
  const storage = new Map([["area", { people: {}, invites: {}, blocks: {}, closingRooms: [], rooms: { [roomId]: { host: a, guest: b, hostAlias: "听众 A", guestAlias: "听众 B", expiresAt: Date.now() + 60000 } } }]]);
  let available = false, attempts = 0;
  const env = { ROOMS: { idFromName: id => id, get: id => ({ fetch: async request => {
    attempts++; assert.equal(id, roomId); assert.deepEqual(await request.json(), { host: a, guest: b });
    if (!available) throw new Error("temporary room failure");
    return Response.json({ ok: true });
  } }) } };
  const area = new NearbyArea(context(storage), env);
  const result = await (await area.fetch(req("block", { roomId }))).json();
  assert.equal(result.closing, true);
  assert.equal(storage.get("area").blocks[a][0].accountId, b);
  assert.deepEqual(storage.get("area").closingRooms, [roomId]);
  assert.ok(storage.get("alarm") > Date.now());
  available = true;
  const restored = new NearbyArea(context(storage), env);
  await restored.alarm();
  assert.equal(attempts, 2);
  assert.deepEqual(storage.get("area").closingRooms, []);
  assert.deepEqual((await (await restored.fetch(req("blocks"))).json()).blocks, result.blocks);
});

test("follow opens a room at once: the followed listener hosts, both get tickets, busy and blocked peers are refused", async () => {
  const storage = new Map();
  const inits = [];
  const env = { ROOMS: { idFromName: id => id, get: id => ({ fetch: async request => {
    if (request.url.endsWith("/status")) return Response.json({ active: true });
    const body = await request.json(); inits.push({ id, url: request.url, body });
    return Response.json({ hostToken: "host-token", guestToken: "guest-token" });
  } }) } };
  const area = new NearbyArea(context(storage), env);
  const c = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const start = async (account, trackId) => (await area.fetch(reqAs(account, "start", { trackId }))).json();
  const { tracks } = await import("../lib/resonance/catalog.generated.json", { with: { type: "json" } }).then(m => m.default);
  const ap = await start(a, tracks[0].id), bp = await start(b, tracks[1].id), cp = await start(c, tracks[0].id);
  assert.equal((await area.fetch(reqAs(a, "follow", { targetId: ap.self.id }, ap.token))).status, 409, "cannot follow yourself");
  const followed = await area.fetch(reqAs(a, "follow", { targetId: bp.self.id }, ap.token));
  assert.equal(followed.status, 200);
  const guest = await followed.json();
  assert.equal(inits.length, 1);
  assert.equal(inits[0].url, "https://room.internal/init");
  assert.deepEqual(inits[0].body, { id: inits[0].id, trackId: tracks[1].id, nearby: true, accounts: { host: b, guest: a } });
  assert.deepEqual(guest.ticket, { roomId: inits[0].id, token: "guest-token", role: "guest", peerAlias: bp.self.alias });
  assert.equal("invite" in guest, false);
  const host = await (await area.fetch(reqAs(b, "state", undefined, bp.token))).json();
  assert.deepEqual(host.ticket, { roomId: inits[0].id, token: "host-token", role: "host", peerAlias: ap.self.alias });
  const third = await (await area.fetch(reqAs(c, "state", undefined, cp.token))).json();
  assert.deepEqual(third.peers, [], "listeners already together leave the radar");
  await area.fetch(reqAs(a, "stop", {}, ap.token));
  const again = await start(a, tracks[0].id);
  const cooled = await area.fetch(reqAs(a, "follow", { targetId: cp.self.id }, again.token));
  assert.equal(cooled.status, 429, "cooldown follows the account, not the presence");
  const busy = await area.fetch(reqAs(c, "follow", { targetId: bp.self.id }, cp.token));
  assert.equal(busy.status, 409); assert.equal((await busy.json()).error, "BUSY");
  const d = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const dp = await start(d, tracks[0].id);
  await area.fetch(reqAs(d, "block", { targetId: cp.self.id }));
  const blocked = await area.fetch(reqAs(c, "follow", { targetId: dp.self.id }, cp.token));
  assert.equal((await blocked.json()).error, "UNAVAILABLE");
  assert.equal(inits.length, 1);
});
