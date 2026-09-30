import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import catalog from '../lib/resonance/catalog.generated.json' with { type: 'json' };
const folder = path.resolve('node_modules/.cache/location-music'); await mkdir(folder, { recursive: true });
const bundle = path.join(folder, `server-${process.pid}.mjs`);
await build({ entryPoints: ['server/nearby-area.ts'], bundle: true, platform: 'node', format: 'esm', outfile: bundle, plugins: [{ name: 'durable-boundary', setup(builder) {
  builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'durable', namespace: 'test' }));
  builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }' }));
} }] });
after(() => unlink(bundle));
const { NearbyArea } = await import(pathToFileURL(bundle));
function context(store) {
  let queue = Promise.resolve();
  return { storage: { get: async key => structuredClone(store.get(key)), put: async (key, value) => store.set(key, structuredClone(value)) }, blockConcurrencyWhile(fn) { const job = queue.then(fn); queue = job.catch(() => {}); return job; } };
}
function setup(store = new Map()) {
  const area = new NearbyArea(context(store), {});
  const call = async (actor, action, body = {}, position = fix(), demo = false) => {
    const result = await area.fetch(new Request(`https://internal/api/bottles/${action}`, { method: 'POST', headers: { 'X-Account-Id': actor, 'X-Bottle-Demo': String(demo) }, body: JSON.stringify({ ...body, ...position }) }));
    return { status: result.status, body: await result.json() };
  };
  return { call, store };
}
const fix = () => ({ latitude: 28.214123, longitude: 112.971234, accuracy: 20, timestamp: Date.now() });
const note = () => ({ id: crypto.randomUUID(), trackId: catalog.tracks[0].id, title: '留给下一位', message: '在这里等了一阵风，也听完了一首歌。' });

test('the same place shares music across accounts, reading never consumes a note, and another place stays separate', async () => {
  const { call, store } = setup();
  assert.deepEqual((await call('a', 'nearby')).body.places, []);
  const n = note(); assert.equal((await call('a', 'leave', n)).status, 200);
  const second = { ...note(), trackId: catalog.tracks[1].id, message: '另一位听众留下了另一首歌。' };
  assert.equal((await call('b', 'leave', second, { ...fix(), latitude: 28.2142 })).status, 200);
  for (const actor of ['a', 'b', 'c', 'b']) {
    const data = (await call(actor, 'nearby')).body;
    assert.equal(data.notes.length, 2);
    assert.equal(data.places.length, 1, 'nearby visitors automatically share the same anchor');
    const original = data.notes.find(item => item.id === n.id);
    assert.equal(original.message, n.message); assert.equal(original.mine, actor === 'a');
    assert.ok(data.notes.some(item => item.trackId === second.trackId));
    assert.equal('owner' in data.notes[0], false); assert.equal('accountId' in data.notes[0], false);
  }
  assert.deepEqual((await call('b', 'nearby', {}, { ...fix(), longitude: 113.5 })).body.notes, []);
  assert.equal((await call('b', 'nearby', {}, { ...fix(), latitude: 28.214 + .0044, longitude: 112.971 })).body.notes.length, 2);
  assert.equal((await call('b', 'nearby', {}, { ...fix(), latitude: 28.214 + .0046, longitude: 112.971 })).body.notes.length, 0, 'the 500m boundary is enforced by the server');
  const stored = store.get('location-music').places[0];
  assert.equal(stored.latitude, 28.214); assert.equal(stored.longitude, 112.971, 'only the coarse anchor is saved');
  assert.equal('accuracy' in stored, false); assert.equal('timestamp' in stored, false);
  const restored = setup(store);
  assert.equal((await restored.call('b', 'nearby')).body.notes.length, 2);
});

test('serialized retries store one note, conflicts are rejected, and only the author can withdraw', async () => {
  const { call } = setup(); const n = note();
  const results = await Promise.all([call('a', 'leave', n), call('a', 'leave', n)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal((await call('b', 'nearby')).body.notes.length, 1);
  assert.equal((await call('a', 'leave', { ...n, message: 'changed' })).status, 409);
  assert.equal((await call('b', 'leave', n)).status, 409);
  assert.equal((await call('b', 'withdraw', { id: n.id })).status, 404);
  assert.equal((await call('a', 'leave', note())).status, 429);
  assert.equal((await call('a', 'withdraw', { id: n.id })).status, 200);
  assert.equal((await call('a', 'withdraw', { id: n.id })).status, 200);
  assert.deepEqual((await call('b', 'nearby')).body.notes, []);
});

test('drawing and AI image notes are stored as visual content without becoming spoken text', async () => {
  const { call } = setup();
  const drawing = { ...note(), contentType: 'drawing', message: '', imageUrl: 'data:image/jpeg;base64,ZmFrZQ==' };
  const ai = { ...note(), id: crypto.randomUUID(), contentType: 'ai', message: '', imageUrl: '/assets/ambient/sound-postcard-bg.png' };
  assert.equal((await call('a', 'leave', drawing)).status, 200);
  assert.equal((await call('b', 'leave', ai)).status, 200);
  const notes = (await call('c', 'nearby')).body.notes;
  assert.equal(notes.find(item => item.id === drawing.id).contentType, 'drawing');
  assert.equal(notes.find(item => item.id === ai.id).contentType, 'ai');
  assert.equal(notes.find(item => item.id === ai.id).imageUrl, ai.imageUrl);
});

test('invalid, stale or imprecise locations and invalid content cannot read or publish', async () => {
  const { call } = setup();
  for (const invalid of [{ latitude: 91 }, { longitude: -181 }, { accuracy: 501 }, { accuracy: -1 }, { timestamp: Date.now() - 121000 }]) {
    for (const action of ['nearby', 'leave']) assert.equal((await call('a', action, note(), { ...fix(), ...invalid })).status, 400);
  }
  for (const invalid of [{ message: 'x'.repeat(601) }, { title: '' }, { trackId: 'missing' }, { contentType: 'drawing', imageUrl: 'https://bad.example/image.png', message: '' }, { contentType: 'ai', imageUrl: 'data:text/plain;base64,ZmFrZQ==', message: '' }]) assert.equal((await call('a', 'leave', { ...note(), ...invalid })).status, 400);
});

test('solo example walls are explicitly seeded without replenishing content or reaching the shared wall', async () => {
  const solo = setup(), shared = setup();
  const first = (await solo.call('a', 'nearby', {}, fix(), true)).body;
  assert.equal(first.places.length, 1); assert.ok(first.notes.length > 0);
  assert.deepEqual((await shared.call('a', 'nearby')).body.places, []);
  assert.equal((await solo.call('a', 'nearby', {}, fix(), true)).body.places.length, 1);
});
