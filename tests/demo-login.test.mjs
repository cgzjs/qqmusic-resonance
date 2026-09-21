import test from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
const result = await build({ entryPoints: ["lib/resonance/demo-host.ts"], bundle: true, platform: "browser", format: "iife", globalName: "loginModule", write: false });
const source = result.outputFiles[0].text;
function environment() {
  const local = new Map(), accounts = new Map(), locks = new Map(); let created = 0;
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.endsWith('/config')) return response({ demo: true });
    if (url.endsWith('/create')) {
      created++;
      const identity = { accountId: webcrypto.randomUUID(), deviceKey: webcrypto.randomUUID() };
      accounts.set(identity.accountId, { ...identity, displayName: body.displayName });
      return response(identity, 201);
    }
    if (url.endsWith('/resume')) {
      const account = accounts.get(options.headers['X-Account-Id']);
      if (account?.deviceKey !== body.deviceKey) return response({}, 401);
      return response({ accountId: account.accountId, displayName: account.displayName, token: webcrypto.randomUUID(), mode: 'demo', expiresAt: Date.now() + 7200000 });
    }
    if (url.endsWith('/logout')) { assert.equal(body.scope, 'session'); return response({ ok: true }); }
    throw new Error(`Unexpected request ${url}`);
  };
  const navigator = { locks: { request: (key, callback) => {
    const job = (locks.get(key) ?? Promise.resolve()).then(callback);
    locks.set(key, job.catch(() => {})); return job;
  } } };
  function tab(session = new Map()) {
    const context = createContext({ localStorage: storage(local), sessionStorage: storage(session), navigator, fetch, AbortSignal, crypto: webcrypto });
    runInContext(source, context);
    const states = []; context.loginModule.demoHost.subscribe(state => states.push(state));
    return { host: context.loginModule.demoHost, session, states };
  }
  return { tab, created: () => created };
}
test('new tabs choose a login; A and B stay separate and survive refresh', async () => {
  const env = environment(), a = env.tab(), b = env.tab();
  assert.equal((await a.host.restore()).status, 'signed-out');
  assert.equal((await b.host.restore()).status, 'signed-out'); assert.equal(env.created(), 0);
  const [aLogin, bLogin] = await Promise.all([a.host.switchAccount('A'), b.host.switchAccount('B')]);
  assert.equal(aLogin.status, 'ready'); assert.equal(bLogin.status, 'ready');
  assert.notEqual(aLogin.session.accountId, bLogin.session.accountId);
  a.host.setTrack(null);
  const refreshedA = await env.tab(a.session).host.restore(), refreshedB = await env.tab(b.session).host.restore();
  assert.equal(refreshedA.session.accountId, aLogin.session.accountId);
  assert.equal(refreshedB.session.accountId, bLogin.session.accountId);
  assert.equal(refreshedA.trackId, null); assert.notEqual(refreshedB.trackId, null);
  await a.host.logout();
  assert.equal((await env.tab(a.session).host.restore()).status, 'signed-out');
  assert.equal((await env.tab(b.session).host.restore()).session.accountId, bLogin.session.accountId);
});
test('simultaneous same-profile login creates one identity and switching cannot adopt stale state', async () => {
  const env = environment(), first = env.tab(), second = env.tab();
  const [a, b] = await Promise.all([first.host.switchAccount('A'), second.host.switchAccount('A')]);
  assert.equal(a.session.accountId, b.session.accountId); assert.equal(env.created(), 1);
  const old = first.host.switchAccount('A');
  first.host.chooseAccount();
  const next = first.host.switchAccount('B');
  await Promise.all([old, next]);
  assert.equal(first.states.at(-1).session.displayName, '模拟听众 B');
  assert.equal(second.states.at(-1).session.displayName, '模拟听众 A');
});
