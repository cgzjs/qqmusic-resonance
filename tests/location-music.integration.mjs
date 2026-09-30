import test from 'node:test';
import assert from 'node:assert/strict';
import { mockAccount, accountHeaders } from './host-test-helpers.mjs';
import catalog from '../lib/resonance/catalog.generated.json' with { type: 'json' };
const base = process.env.ROOM_TEST_URL ?? 'http://localhost:5173';
const position = () => ({ latitude: 35.123456, longitude: 115.654321, accuracy: 20, timestamp: Date.now() });
const call = (account, action, body = {}, location = position(), experience = 'online') => fetch(`${base}/api/bottles/${action}?experience=${experience}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...accountHeaders(account.session) }, body: JSON.stringify({ ...body, ...location }) });
test('visitors share one place across sessions, replay safely, keep other places private to their selection, and only withdraw their own content', async () => {
  const a = await mockAccount(base), b = await mockAccount(base, '模拟听众 B');
  const note = { id: crypto.randomUUID(), trackId: catalog.tracks[0].id, title: '路过的人', message: '这首歌留在同一个地方，后来的人也能听到。' };
  const secondNote = { ...note, id: crypto.randomUUID(), trackId: catalog.tracks[1].id, title: '另一个人的歌', message: '同一个公园，不同人的音乐。' };
  try {
    assert.equal((await call(a, 'leave', note)).status, 200);
    assert.equal((await call(a, 'leave', note)).status, 200);
    assert.equal((await call(b, 'leave', secondNote)).status, 200);
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await call(b, 'nearby'); assert.equal(response.status, 200);
      const data = await response.json(); assert.equal(data.notes.length, 2);
      const original = data.notes.find(item => item.id === note.id); assert.equal(original.message, note.message); assert.equal(original.mine, false);
      assert.equal(data.notes.find(item => item.id === secondNote.id).mine, true);
      assert.equal('owner' in data.notes[0], false);
    }
    assert.equal((await call(b, 'withdraw', { id: note.id })).status, 404);
    assert.equal((await call({ session: { ...b.session, accountId: a.session.accountId } }, 'nearby')).status, 401);
    assert.equal((await fetch(`${base}/api/bottles/nearby`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(position()) })).status, 401);
    const far = await call(b, 'nearby', {}, { ...position(), longitude: 116 }); assert.deepEqual((await far.json()).notes, []);
    const demo = await call(a, 'nearby', {}, { ...position(), latitude: 28.214, longitude: 112.971 }, 'demo');
    assert.equal(demo.status, 200); assert.ok(!(await demo.json()).notes.some(item => item.id === note.id));
    assert.equal((await call(b, 'nearby', {}, { ...position(), timestamp: Date.now() - 121000 })).status, 400);
    assert.equal((await call(a, 'withdraw', { id: note.id })).status, 200);
    assert.deepEqual((await (await call(b, 'nearby')).json()).notes.map(item => item.id), [secondNote.id]);
  } finally {
    await call(a, 'withdraw', { id: note.id });
    await call(b, 'withdraw', { id: secondNote.id });
    for (const account of [a, b]) await fetch(`${base}/api/host/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...accountHeaders(account.session) }, body: '{}' });
  }
});
