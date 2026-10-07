import test from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
const result = await build({ entryPoints: ["lib/resonance/demo-host.ts"], bundle: true, platform: "browser", format: "iife", globalName: "loginModule", write: false });
const source = result.outputFiles[0].text;
function environment({ useLocks = true } = {}) {
  const local = new Map(), accounts = new Map(), locks = new Map(); let created = 0, preview = false, resumeFailure = null, resumeGate = null;
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.endsWith('/config')) return response({ demo: !preview, preview });
    if (url.endsWith('/create')) {
      created++;
      const identity = { accountId: webcrypto.randomUUID(), deviceKey: webcrypto.randomUUID() };
      accounts.set(identity.accountId, { ...identity, displayName: body.displayName });
      return response(identity, 201);
    }
    if (url.endsWith('/resume')) {
      if (resumeGate) { const gate = resumeGate; resumeGate = null; gate.started(); await gate.wait; }
      if (resumeFailure instanceof Error) throw resumeFailure;
      if (resumeFailure) return response({}, resumeFailure);
      const account = accounts.get(options.headers['X-Account-Id']);
      if (account?.deviceKey !== body.deviceKey) return response({}, 401);
      return response({ accountId: account.accountId, displayName: account.displayName, token: webcrypto.randomUUID(), mode: preview ? 'preview' : 'demo', expiresAt: Date.now() + 7200000 });
    }
    if (url.endsWith('/logout')) { assert.equal(body.scope, 'session'); return response({ ok: true }); }
    throw new Error(`Unexpected request ${url}`);
  };
  const navigator = useLocks ? { locks: { request: (key, callback) => {
    const job = (locks.get(key) ?? Promise.resolve()).then(callback);
    locks.set(key, job.catch(() => {})); return job;
  } } } : {};
  function tab(session = new Map()) {
    const context = createContext({ localStorage: storage(local), sessionStorage: storage(session), navigator, fetch, AbortSignal, crypto: webcrypto });
    runInContext(source, context);
    const states = []; context.loginModule.demoHost.subscribe(state => states.push(state));
    return { host: context.loginModule.demoHost, session, states };
  }
  return {
    tab, created: () => created, setPreview: value => { preview = value; },
    forget: () => accounts.clear(), rotateDevice: accountId => { accounts.get(accountId).deviceKey = webcrypto.randomUUID(); },
    breakResume: failure => { resumeFailure = failure; },
    storedIdentity: () => local.get(`${preview ? 'resonance.preview-host' : 'resonance.mock-host'}.identity.A`),
    deferResume() {
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const wait = new Promise(resolve => { release = resolve; });
      resumeGate = { started: entered, wait };
      return { started, release };
    },
  };
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

test('preview restore uses its own browser identity and preserves the local-demo profile', async () => {
  const env = environment(), local = env.tab();
  const first = await local.host.switchAccount('A');
  env.setPreview(true);
  const preview = env.tab(local.session);
  assert.equal((await preview.host.restore()).status, 'signed-out');
  const joined = await preview.host.switchAccount('A');
  assert.equal(joined.session.mode, 'preview');
  assert.notEqual(joined.session.accountId, first.session.accountId);
  const restored = await env.tab(preview.session).host.restore();
  assert.equal(restored.session.accountId, joined.session.accountId);
  env.setPreview(false);
  const original = await env.tab(local.session).host.restore();
  assert.equal(original.session.accountId, first.session.accountId);
  assert.equal(original.session.mode, 'demo');
});

test('an identity the server no longer knows is replaced once and survives refresh', async () => {
  const env = environment(), first = env.tab();
  const login = await first.host.switchAccount('A');
  env.forget();
  const refreshed = await env.tab(first.session).host.restore();
  assert.equal(refreshed.status, 'ready'); assert.equal(refreshed.error, null);
  assert.notEqual(refreshed.session.accountId, login.session.accountId);
  assert.equal(env.created(), 2);
  const again = await env.tab(first.session).host.restore();
  assert.equal(again.session.accountId, refreshed.session.accountId);
  assert.equal(env.created(), 2);
});

test('a rejected device key is replaced while service failures preserve the new identity', async () => {
  const env = environment(), tab = env.tab();
  const login = await tab.host.switchAccount('A');
  env.rotateDevice(login.session.accountId);
  const recovered = await tab.host.restore();
  assert.equal(recovered.status, 'ready'); assert.equal(env.created(), 2);
  assert.notEqual(recovered.session.accountId, login.session.accountId);
  const stored = env.storedIdentity();
  env.breakResume(503);
  assert.equal((await tab.host.restore()).status, 'unavailable');
  assert.equal(env.storedIdentity(), stored); assert.equal(env.created(), 2);
  env.breakResume(null);
  assert.equal((await tab.host.restore()).session.accountId, recovered.session.accountId);
});

test('simultaneous stale-profile restores reuse one replacement account', async () => {
  const env = environment(), first = env.tab();
  const login = await first.host.switchAccount('A');
  env.forget();
  const second = env.tab(new Map(first.session));
  const [a, b] = await Promise.all([first.host.restore(), second.host.restore()]);
  assert.equal(a.status, 'ready'); assert.equal(b.status, 'ready');
  assert.notEqual(a.session.accountId, login.session.accountId);
  assert.equal(a.session.accountId, b.session.accountId);
  assert.equal(env.created(), 2);
});

test('identity recovery also works without the Web Locks API', async () => {
  const env = environment({ useLocks: false }), tab = env.tab();
  const login = await tab.host.switchAccount('A');
  env.forget();
  const recovered = await tab.host.restore();
  assert.equal(recovered.status, 'ready');
  assert.notEqual(recovered.session.accountId, login.session.accountId);
  assert.equal(env.created(), 2);
});

test('a second rejection stops recovery and retains the replacement for a later retry', async () => {
  const env = environment(), tab = env.tab();
  await tab.host.switchAccount('A');
  env.breakResume(401);
  assert.equal((await tab.host.restore()).status, 'unavailable');
  assert.equal(env.created(), 2);
  const stored = JSON.parse(env.storedIdentity());
  env.breakResume(null);
  assert.equal((await tab.host.restore()).session.accountId, stored.accountId);
  assert.equal(env.created(), 2);
});

test('canceling a pending restore prevents its late rejection from deleting the saved identity', async () => {
  const env = environment(), tab = env.tab();
  await tab.host.switchAccount('A');
  const stored = env.storedIdentity();
  env.forget();
  const gate = env.deferResume(), pending = tab.host.restore();
  await gate.started;
  tab.host.chooseAccount();
  gate.release();
  assert.equal((await pending).status, 'signed-out');
  assert.equal(env.storedIdentity(), stored); assert.equal(env.created(), 1);
});

test('network failures do not remove or replace a valid saved identity', async () => {
  const env = environment(), tab = env.tab();
  const login = await tab.host.switchAccount('A');
  const stored = env.storedIdentity();
  env.breakResume(new Error('Network unavailable'));
  assert.equal((await tab.host.restore()).status, 'unavailable');
  assert.equal(env.storedIdentity(), stored); assert.equal(env.created(), 1);
  env.breakResume(null);
  assert.equal((await tab.host.restore()).session.accountId, login.session.accountId);
});
