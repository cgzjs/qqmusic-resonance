import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const { tracks } = JSON.parse(await readFile(new URL('../lib/resonance/catalog.generated.json', import.meta.url), 'utf8'));
async function call(path, session, body, expected = 200, presence) {
  const response = await fetch(`${base}/api/${path}`, { method: body ? 'POST' : 'GET', headers: { ...accountHeaders(session), 'Content-Type': 'application/json', ...(presence ? { Authorization: `Bearer ${presence}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, path); return response.json();
}
test('tab logout revokes its session and presence while other sessions and accounts stay usable', async () => {
  const a = await mockAccount(base), b = await mockAccount(base, '模拟听众 B');
  const secondA = await call('host/resume', a.session, { deviceKey: a.identity.deviceKey });
  const presence = await call('nearby/start', secondA, { trackId: tracks[0].id }, 201);
  await call('host/logout', a.session, { scope: 'invalid' }, 400);
  await call('host/logout', a.session, { scope: 'session' });
  await call('host/data', a.session, undefined, 401);
  await call('host/data', secondA); await call('host/data', b.session);
  await call('nearby/state', secondA, undefined, 200, presence.token);
  await call('host/logout', secondA, { scope: 'session' });
  const newA = await call('host/resume', a.session, { deviceKey: a.identity.deviceKey });
  await call('nearby/state', newA, undefined, 401, presence.token);
  const lastA = await call('host/resume', newA, { deviceKey: a.identity.deviceKey });
  await call('host/logout', newA, {});
  await call('host/data', lastA, undefined, 401);
  await call('host/data', b.session);
});
