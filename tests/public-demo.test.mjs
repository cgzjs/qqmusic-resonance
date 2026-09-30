import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import catalog from "../lib/resonance/catalog.generated.json" with { type: "json" };

const folder = path.resolve("node_modules/.cache/public-demo");
await mkdir(folder, { recursive: true });
const bundle = path.join(folder, `public-demo-${process.pid}.mjs`);
await build({ stdin: { contents: "export { hostApi, hostAccountScope, verifyAccount } from './server/host-api'; export { PluginAccount } from './server/plugin-account'; export { default as worker } from './server/worker';", resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", outfile: bundle,
  plugins: [{ name: "worker-boundary", setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "workers", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" }));
    builder.onResolve({ filter: /^vinext\/server\/fetch-handler$/ }, () => ({ path: "handler", namespace: "handler" }));
    builder.onLoad({ filter: /.*/, namespace: "handler" }, () => ({ contents: "export default { fetch: () => new Response('page') };" }));
  } }],
});
after(() => unlink(bundle));
const { hostApi, hostAccountScope, verifyAccount, PluginAccount, worker } = await import(pathToFileURL(bundle));
const publicOrigin = "https://contest.example.test";
function environment(vars = {}, stores = new Map()) {
  const objects = new Map(), nearbyCalls = [];
  const env = { ...vars, ACCOUNTS: { idFromName: name => name, get(name) {
    if (!objects.has(name)) {
      const values = stores.get(name) ?? new Map(); stores.set(name, values);
      let queue = Promise.resolve();
      const storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => values.set(key, structuredClone(value)), delete: async key => values.delete(key), setAlarm: async at => values.set("alarm", at), transaction: async fn => fn(storage) };
      const ctx = { storage, blockConcurrencyWhile(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } };
      objects.set(name, new PluginAccount(ctx, env));
    }
    return objects.get(name);
  } }, NEARBY: { idFromName: name => name, get: name => ({ fetch: async request => { nearbyCalls.push({ name, scope: request.headers.get("X-Account-Scope") }); return Response.json({ ok: true }); } }) }, ROOMS: { idFromName: name => name, get: () => { throw new Error("Anonymous room allocation must be refused"); } } };
  return { env, stores, nearbyCalls };
}
const request = (origin, action, body, session) => new Request(`${origin}/api/host/${action}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(session ? { "X-Account-Id": session.accountId, "X-Account-Token": session.token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function login(env, origin, displayName = "模拟听众 A") {
  const created = await hostApi(request(origin, "create", { displayName }), env);
  assert.equal(created.status, 201);
  const identity = await created.json();
  const resumed = await hostApi(request(origin, "resume", { deviceKey: identity.deviceKey }, { accountId: identity.accountId }), env);
  assert.equal(resumed.status, 200);
  return { identity, session: await resumed.json() };
}

test("public preview is off by default, requires an exact origin, and preserves localhost-only demo", async () => {
  const { env } = environment({ DEMO_HOST_ENABLED: "true" });
  assert.equal(hostAccountScope(request("http://localhost:5173", "config"), env), "demo");
  assert.equal(hostAccountScope(request(publicOrigin, "config"), env), null);
  assert.equal((await hostApi(request(publicOrigin, "create", { displayName: "模拟听众 A" }), env)).status, 503);
  env.PUBLIC_DEMO_ORIGIN = publicOrigin;
  assert.equal(hostAccountScope(request(publicOrigin, "config"), env), "preview");
  for (const origin of ["https://other.example.test", "http://contest.example.test", "https://contest.example.test:444"]) assert.equal(hostAccountScope(request(origin, "config"), env), null);
  for (const configured of ["*", "http://contest.example.test", `${publicOrigin}/other`, `${publicOrigin}?enabled=true`, "https://user:password@contest.example.test"]) {
    env.PUBLIC_DEMO_ORIGIN = configured;
    assert.equal(hostAccountScope(request(publicOrigin, "config"), env), null);
  }
});

test("preview image generation has a durable per-account cooldown", async () => {
  const { env } = environment({ PUBLIC_DEMO_ORIGIN: publicOrigin });
  const account = await login(env, publicOrigin);
  const object = env.ACCOUNTS.get(`preview-account:${account.identity.accountId}`);
  const call = () => object.fetch(new Request("https://account.internal/image-rate", { method: "POST", body: JSON.stringify({ accountId: account.identity.accountId }) }));
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 429);
});

test("preview visitors have separate accounts; tokens and device proofs cannot cross account or local-demo boundaries", async () => {
  const { env, stores } = environment({ PUBLIC_DEMO_ORIGIN: publicOrigin, DEMO_HOST_ENABLED: "true" });
  const a = await login(env, publicOrigin), b = await login(env, publicOrigin);
  assert.equal(a.session.mode, "preview"); assert.notEqual(a.session.accountId, b.session.accountId);
  assert.ok(stores.has(`preview-account:${a.session.accountId}`));
  const saved = await hostApi(request(publicOrigin, "data", { action: "favorite", trackId: catalog.tracks[0].id }, a.session), env);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).favoriteIds, [catalog.tracks[0].id]);
  assert.deepEqual((await (await hostApi(request(publicOrigin, "data", undefined, b.session), env)).json()).favoriteIds, []);
  assert.equal((await hostApi(request(publicOrigin, "data", undefined, { ...b.session, accountId: a.session.accountId }), env)).status, 401);
  assert.equal((await hostApi(request(publicOrigin, "resume", { deviceKey: b.identity.deviceKey }, a.session), env)).status, 401);
  assert.equal(await verifyAccount(request("http://localhost:5173", "data", undefined, a.session), env), false);
  const local = await login(env, "http://localhost:5173");
  assert.equal(local.session.mode, "demo");
  assert.equal(await verifyAccount(request(publicOrigin, "data", undefined, local.session), env), false);
});

test("preview creation is bounded durably and becomes available after its rate window", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const { env, stores } = environment({ PUBLIC_DEMO_ORIGIN: publicOrigin });
  const results = await Promise.all(Array.from({ length: 18 }, () => hostApi(request(publicOrigin, "create", { displayName: "模拟听众 A" }), env)));
  assert.equal(results.filter(result => result.status === 201).length, 16);
  assert.equal(results.filter(result => result.status === 429).length, 2);
  const limited = results.find(result => result.status === 429);
  assert.ok(Number(limited.headers.get("Retry-After")) > 0);
  const restored = environment({ PUBLIC_DEMO_ORIGIN: publicOrigin }, stores);
  // The limiter's counter is stored rather than tied to one request's memory.
  assert.ok([...stores.values()].some(store => store.get("preview-rate")?.count === 16));
  assert.equal((await hostApi(request(publicOrigin, "create", { displayName: "模拟听众 A" }), restored.env)).status, 429);
  assert.equal((await hostApi(request(publicOrigin, "create", { displayName: "unsupported" }), env)).status, 400);
  t.mock.timers.tick(600_001);
  const limiter = [...stores.keys()].find(name => name.startsWith("preview-rate:"));
  await restored.env.ACCOUNTS.get(limiter).alarm();
  assert.equal(stores.get(limiter).has("preview-rate"), false);
  assert.equal((await hostApi(request(publicOrigin, "create", { displayName: "模拟听众 A" }), restored.env)).status, 201);
});

test("the worker overrides forged account scope, separates nearby state, and refuses anonymous public rooms", async () => {
  const { env, nearbyCalls } = environment({ PUBLIC_DEMO_ORIGIN: publicOrigin });
  const { session } = await login(env, publicOrigin);
  const response = await worker.fetch(new Request(`${publicOrigin}/api/nearby/start`, { method: "POST", headers: { "Content-Type": "application/json", "X-Account-Id": session.accountId, "X-Account-Token": session.token, "X-Account-Scope": "demo" }, body: JSON.stringify({ trackId: catalog.tracks[0].id }) }), env, {});
  assert.equal(response.status, 200);
  assert.deepEqual(nearbyCalls, [{ name: "preview-area-v1", scope: "preview" }]);
  const room = await worker.fetch(new Request(`${publicOrigin}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: catalog.tracks[0].id }) }), env, {});
  assert.equal(room.status, 403);
  const internal = await worker.fetch(new Request(`${publicOrigin}/api/host/preview-rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), env, {});
  assert.equal(internal.status, 404);
  const disabled = await worker.fetch(new Request("https://other.example.test/api/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/status"), env, {});
  assert.equal(disabled.status, 503);
});
