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
const req = (action, body) => new Request(`https://nearby.internal/${action}`, { method: body ? "POST" : "GET", headers: { "X-Account-Id": a }, ...(body ? { body: JSON.stringify(body) } : {}) });

test("legacy area state migrates without losing invitations and keeps a private empty block list", async () => {
  const storage = new Map([["area", { people: {}, invites: { old: { id: "old", status: "cancelled", expiresAt: Date.now() } } }]]);
  const area = new NearbyArea(context(storage), {});
  assert.deepEqual(await (await area.fetch(req("blocks"))).json(), { blocks: [] });
  await area.fetch(req("unblock", { id: b }));
  assert.ok(storage.get("area").invites.old);
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
