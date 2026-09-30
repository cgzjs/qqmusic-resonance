import test, { after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
const folder = path.resolve('node_modules/.cache/location-music'); await mkdir(folder, { recursive: true });
const bundle = path.join(folder, `client-${process.pid}.mjs`);
await build({ stdin: { contents: "export { usePlaceMusic } from './hooks/usePlaceMusic';", resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: bundle, plugins: [{ name: 'host-boundary', setup(builder) {
  builder.onResolve({ filter: /^@\/lib\/resonance\/demo-host$/ }, () => ({ path: 'host', namespace: 'test' }));
  builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const demoHost = { expire() { globalThis.placeTest.expired++; } };' }));
} }] });
after(() => unlink(bundle));
const { usePlaceMusic } = await import(pathToFileURL(bundle));
let dom, root, current, calls, respond, locate;
const session = { accountId: 'account-a', token: 'token-a', mode: 'demo', expiresAt: Date.now() + 60000 };
const snapshot = { places: [], notes: [], placeId: null };
beforeEach(() => {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:5173/nearby' });
  for (const key of ['window', 'document', 'navigator', 'sessionStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.placeTest = { expired: 0 };
  calls = []; respond = async () => Response.json(snapshot);
  locate = success => success({ coords: { latitude: 28.214, longitude: 112.971, accuracy: 20 }, timestamp: Date.now() });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (...args) => locate(...args) } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  root = createRoot(document.getElementById('app'));
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });
async function mount(account = session, experience = 'online') {
  function Harness() { current = usePlaceMusic(account, experience); return null; }
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
}

test('an unconfirmed write survives remount and retries the same id without a new submission', async () => {
  await mount();
  const command = { action: 'leave', body: { id: crypto.randomUUID(), trackId: 'a-song', title: 'title', message: 'message' } };
  respond = async () => { throw new TypeError('connection lost after server accepted'); };
  await act(async () => current.act(command));
  assert.equal(current.pending.body.id, command.body.id); assert.match(current.error, /未确认/);
  const before = calls.length;
  await act(async () => current.act({ ...command, body: { ...command.body, id: crypto.randomUUID() } }));
  assert.equal(calls.length, before, 'unconfirmed requests cannot silently create another note');
  await act(async () => root.render(null));
  respond = async () => Response.json(snapshot); await mount();
  assert.equal(current.pending.body.id, command.body.id);
  await act(async () => current.retry());
  const submissions = calls.filter(call => call.url.includes('/leave?'));
  assert.equal(submissions.length, 2);
  for (const submission of submissions) {
    const { latitude, longitude, accuracy, timestamp, ...payload } = JSON.parse(submission.options.body);
    assert.deepEqual(payload, command.body); assert.equal(latitude, 28.214); assert.equal(longitude, 112.971); assert.equal(accuracy, 20); assert.ok(timestamp > 0);
  }
  assert.equal(current.pending, null);
});

test('location permission failures never fetch a fallback; retry locates again and demo never requests device coordinates', async () => {
  let attempts = 0;
  locate = (_success, failure) => { attempts++; failure({ code: 1 }); };
  await mount(); assert.equal(calls.length, 0); assert.equal(current.ready, false); assert.match(current.error, /允许位置/);
  locate = success => { attempts++; success({ coords: { latitude: 28.214, longitude: 112.971, accuracy: 20 }, timestamp: Date.now() }); };
  await act(async () => current.retry()); assert.equal(attempts, 2); assert.equal(calls.length, 1);
  await act(async () => root.render(null));
  locate = () => { throw new Error('demo must not request real location'); };
  await mount(session, 'demo'); assert.equal(current.ready, true);
});

test('a late geolocation callback after unmount cannot send coordinates to the server', async () => {
  let complete;
  locate = success => { complete = success; };
  await mount(); await act(async () => root.render(null));
  await act(async () => complete({ coords: { latitude: 28.214, longitude: 112.971, accuracy: 20 }, timestamp: Date.now() }));
  assert.equal(calls.length, 0);
});

test('late data cannot cross account or experience boundaries and expired authentication is surfaced', async () => {
  let complete;
  respond = () => new Promise(resolve => { complete = resolve; });
  await mount(); const finishOld = complete;
  await act(async () => root.render(null));
  respond = async () => Response.json(snapshot); await mount({ ...session, accountId: 'account-b', token: 'token-b' }, 'demo');
  await act(async () => finishOld(Response.json({ ...snapshot, notes: [{ id: 'old-account-note' }] })));
  assert.deepEqual(current.data.notes, []);
  assert.ok(calls.at(-1).url.includes('experience=demo'));
  assert.equal(calls.at(-1).options.headers['X-Account-Token'], 'token-b');
  respond = async () => Response.json({ error: 'AUTH_EXPIRED' }, { status: 401 });
  await act(async () => current.refresh());
  assert.equal(placeTest.expired, 1);
});
