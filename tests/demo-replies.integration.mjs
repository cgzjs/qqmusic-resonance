import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const { tracks } = JSON.parse(await readFile(new URL("../lib/resonance/catalog.generated.json", import.meta.url), "utf8"));
async function data(session, body, expected = 200) {
  const response = await fetch(`${base}/api/host/data`, { method: body ? "POST" : "GET", headers: { ...accountHeaders(session), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected); return response.json();
}
async function ready(session, id) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) { const value = await data(session); if (value.demoReplies.some(item => item.id === id && item.status === "ready")) return value; await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error("Persisted reply did not complete");
}
function exchange() {
  const id = crypto.randomUUID();
  const builtIns = { "demo-night": "listener-01", "demo-glass": "listener-02", "demo-breeze": "listener-03", "demo-dawn": "listener-04" };
  return { action: "queueExchange", id, trackId: tracks[0].id, event: { id, type: "exchange", trackId: tracks[0].id, receivedTrackId: tracks[1].id, listenerId: builtIns[tracks[0].id] ?? `listener-${tracks[0].id}`, scene: "cafe", createdAt: new Date().toISOString() } };
}
test("refresh/resume keeps original deadline, duplicate submission and competing claims are idempotent", async () => {
  const a = await mockAccount(base), b = await mockAccount(base);
  const command = exchange();
  const started = await data(a.session, command);
  const dueAt = started.demoReplies[0].dueAt;
  assert.equal(started.events.length, 0);
  assert.equal((await data(a.session, command)).demoReplies[0].dueAt, dueAt);
  await data(a.session, { ...command, trackId: tracks[1].id }, 409);
  assert.equal((await data(a.session, { action: "claimReply", id: command.id })).claimed, false);
  const response = await fetch(`${base}/api/host/resume`, { method: "POST", headers: { "X-Account-Id": a.session.accountId, "Content-Type": "application/json" }, body: JSON.stringify({ deviceKey: a.identity.deviceKey }) });
  assert.equal(response.status, 200); const restored = await response.json();
  const afterRefresh = await data(restored);
  assert.equal(afterRefresh.demoReplies[0].dueAt, dueAt);
  const completed = await ready(restored, command.id);
  assert.equal(completed.events.filter(event => event.id === command.id).length, 1);
  assert.equal(Date.parse(completed.events[0].createdAt), dueAt);
  assert.equal((await data(b.session, { action: "claimReply", id: command.id })).claimed, false);
  await data({ ...a.session, token: b.session.token }, undefined, 401);
  const claims = await Promise.all([data(a.session, { action: "claimReply", id: command.id }), data(restored, { action: "claimReply", id: command.id })]);
  assert.equal(claims.filter(value => value.claimed).length, 1);
  const repeated = await data(restored, command);
  assert.equal(repeated.events.filter(event => event.id === command.id).length, 1);
  assert.equal((await data(restored, { action: "claimReply", id: command.id })).claimed, false);
});

test("reaction and exchange can wait together; missing clients do not cancel saved work", async () => {
  const a = await mockAccount(base);
  const wave = { action: "queueWave", id: crypto.randomUUID(), trackId: tracks[0].id };
  await data(a.session, wave);
  await data(a.session, { ...wave, id: crypto.randomUUID(), action: "queueHeart" }, 409);
  const command = exchange(); await data(a.session, command);
  // No client polling/heartbeat while both server-owned deadlines elapse.
  await new Promise(resolve => setTimeout(resolve, 3000));
  const completed = await data(a.session);
  assert.equal(completed.demoReplies.filter(item => item.status === "ready").length, 2);
  assert.equal(completed.events.length, 1);
  assert.equal((await data(a.session, { action: "claimReply", id: wave.id })).reply.kind, "wave");
  assert.equal((await data(a.session, { action: "claimReply", id: wave.id })).claimed, false);
  await data(a.session, { action: "queueHeart", id: crypto.randomUUID(), trackId: "missing-track" }, 400);
});
