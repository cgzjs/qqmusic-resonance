import test from "node:test";
import assert from "node:assert/strict";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
async function api(path, session, body, expected = 200) {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(session ? accountHeaders(session) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, path);
  return response.json();
}
test("host identity persists data, separates accounts and rejects forged identity", async () => {
  const a = await mockAccount(base), b = await mockAccount(base, "模拟听众 B");
  await api("/api/host/data", a.session, { action: "favorite", trackId: "demo-night" });
  const eventId = crypto.randomUUID();
  await api("/api/host/data", a.session, { action: "listen", trackId: "demo-glass", id: eventId });
  const aData = await api("/api/host/data", a.session, { action: "listen", trackId: "demo-glass", id: eventId });
  assert.deepEqual(aData.favoriteIds, ["demo-night"]); assert.equal(aData.history.length, 1);
  assert.deepEqual(await api("/api/host/data", b.session), { favoriteIds: [], listenLaterIds: [], events: [], history: [], onlineExchanges: [] });
  await api("/api/host/data", { ...b.session, accountId: a.session.accountId }, undefined, 401);
  await api("/api/host/resume", a.session, { deviceKey: b.identity.deviceKey }, 401);
  await api("/api/host/data", a.session, { action: "favorite", trackId: "not-licensed" }, 400);
  await api("/api/host/logout", a.session, {});
  await api("/api/host/data", a.session, undefined, 401);
  await api("/api/nearby/start", a.session, { trackId: "demo-night" }, 401);
  const restored = await api("/api/host/resume", a.session, { deviceKey: a.identity.deviceKey });
  assert.notEqual(restored.token, a.session.token);
  assert.deepEqual((await api("/api/host/data", restored)).favoriteIds, ["demo-night"]);
  await api("/api/host/data", restored, { action: "unfavorite", trackId: "demo-night" });
  assert.deepEqual((await api("/api/host/data", restored)).favoriteIds, []);
});
test("nearby requires host login, disallows duplicate identity and binds presence to account", async () => {
  const a = await mockAccount(base), b = await mockAccount(base, "模拟听众 B");
  await api("/api/nearby/start", null, { trackId: "demo-night" }, 401);
  const presence = await api("/api/nearby/start", a.session, { trackId: "demo-night" }, 201);
  await api("/api/nearby/start", a.session, { trackId: "demo-night" }, 409);
  const stateRequest = async session => fetch(`${base}/api/nearby/state`, { headers: { ...accountHeaders(session), Authorization: `Bearer ${presence.token}` } });
  assert.equal((await stateRequest(b.session)).status, 401);
  const update = await fetch(`${base}/api/nearby/track`, { method: "POST", headers: { ...accountHeaders(a.session), Authorization: `Bearer ${presence.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "demo-glass" }) });
  assert.equal((await update.json()).self.trackId, "demo-glass");
  await api("/api/host/logout", a.session, {});
  assert.equal((await stateRequest(a.session)).status, 401);
  const visible = await api("/api/nearby/start", b.session, { trackId: "demo-night" }, 201);
  assert.ok(!visible.peers.some(peer => peer.id === presence.self.id));
  await api("/api/host/logout", b.session, {});
});

test("integrated library persists later, validated demo events and existing online history", async () => {
  const { session, identity } = await mockAccount(base);
  await api("/api/host/data", session, { action: "later", trackId: "demo-glass" });
  await api("/api/host/data", session, { action: "later", trackId: "demo-glass" });
  assert.deepEqual((await api("/api/host/data", session)).listenLaterIds, ["demo-glass"]);
  const event = { id: crypto.randomUUID(), type: "exchange", trackId: "demo-night", receivedTrackId: "demo-glass", listenerId: "listener-01", scene: "cafe", createdAt: new Date().toISOString() };
  await api("/api/host/data", session, { action: "event", trackId: event.trackId, event });
  await api("/api/host/data", session, { action: "event", trackId: event.trackId, event });
  await api("/api/host/data", session, { action: "event", trackId: event.trackId, event: { ...event, id: crypto.randomUUID(), receivedTrackId: "demo-night" } }, 400);
  await api("/api/host/data", session, { action: "event", trackId: event.trackId, event: { ...event, listenerId: "unknown-person" } }, 400);
  await api("/api/host/data", session, { action: "event", trackId: "demo-glass", event }, 400);
  await api("/api/host/data", session, { action: "listen", trackId: "demo-breeze", id: crypto.randomUUID() });
  await api("/api/host/data", session, { action: "favorite", trackId: "demo-glass" });
  await api("/api/host/data", session, { action: "later", trackId: "demo-glass" });
  const restored = await api("/api/host/resume", session, { deviceKey: identity.deviceKey });
  const data = await api("/api/host/data", restored);
  assert.deepEqual(data.favoriteIds, ["demo-glass"]); assert.deepEqual(data.listenLaterIds, []);
  assert.equal(data.events.length, 1); assert.equal(data.history.length, 1);
  assert.equal(data.events[0].receivedTrackId, "demo-glass"); assert.equal(data.history[0].trackId, "demo-breeze");
  await api("/api/host/data", restored, { action: "later", trackId: "demo-dawn" });
  await api("/api/host/data", restored, { action: "removeLater", trackId: "demo-dawn" });
  assert.deepEqual((await api("/api/host/data", restored)).listenLaterIds, []);
});
