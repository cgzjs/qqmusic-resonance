import test from "node:test";
import assert from "node:assert/strict";
import { transitionExchange, deliverExchange, exchangeRecord } from "../lib/resonance/exchange-protocol.ts";
import { parseRoomMessage, isRoomSnapshot } from "../lib/resonance/room-protocol.ts";
const now = 1_000_000;
const tracks = ["a", "b", "c"];
const offer = { type: "exchange", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", action: "offer", trackId: "a", sentAt: now };
const pending = () => transitionExchange(null, "host", offer, now, true, tracks).exchange;
const response = (action, trackId) => ({ type: "exchange", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", action, trackId, exchangeId: offer.id, sentAt: now });
test("exchange state machine enforces roles, one pending offer and distinct licensed response", () => {
  const state = pending();
  assert.equal(state.expiresAt, now + 60_000);
  assert.equal(transitionExchange(state, "guest", { ...offer, id: "new" }, now, true, tracks).error, "EXCHANGE_BUSY");
  assert.equal(transitionExchange(state, "host", response("respond", "b"), now, true, tracks).error, "EXCHANGE_FORBIDDEN");
  assert.equal(transitionExchange(state, "guest", response("cancel"), now, true, tracks).error, "EXCHANGE_FORBIDDEN");
  assert.equal(transitionExchange(state, "guest", response("respond", "a"), now, true, tracks).error, "EXCHANGE_INVALID_REPLY");
  assert.equal(transitionExchange(state, "guest", response("respond", "foreign"), now, true, tracks).error, "EXCHANGE_INVALID_REPLY");
  assert.equal(transitionExchange(state, "guest", response("respond", "b"), now, false, tracks).error, "PEER_OFFLINE");
  const completed = transitionExchange(state, "guest", response("respond", "b"), now, true, tracks).exchange;
  assert.equal(completed.status, "completed");
  assert.deepEqual(exchangeRecord("room", completed, "host"), { id: offer.id, roomId: "room", sentTrackId: "a", receivedTrackId: "b", completedAt: now });
  assert.equal(exchangeRecord("room", completed, "guest").receivedTrackId, "a");
});
test("decline, cancel, expiry and stale requests cannot complete a finished exchange", () => {
  const state = pending();
  for (const [role, action, status] of [["host", "cancel", "cancelled"], ["guest", "decline", "declined"]]) {
    const ended = transitionExchange(state, role, response(action), now, false, tracks).exchange;
    assert.equal(ended.status, status);
    assert.equal(transitionExchange(ended, "guest", response("respond", "b"), now, true, tracks).error, "EXCHANGE_FINISHED");
  }
  assert.equal(transitionExchange(state, "guest", { ...response("respond", "b"), sentAt: state.expiresAt }, state.expiresAt, true, tracks).error, "EXCHANGE_FINISHED");
  assert.equal(transitionExchange(null, "host", offer, now + 10_001, true, tracks).error, "EXCHANGE_STALE");
  assert.equal(transitionExchange(null, "host", { ...offer, sentAt: now + 2000 }, now, true, tracks).error, "EXCHANGE_STALE");
});
test("partial account failure retains durable retry state, stable IDs and successful side", async () => {
  const completed = transitionExchange(pending(), "guest", response("respond", "b"), now, true, tracks).exchange;
  const item = { exchange: completed, accounts: { host: "A", guest: "B" }, saved: { host: false, guest: false }, attempts: 0, nextAttemptAt: now };
  const received = [];
  const partial = await deliverExchange(item, "room", now, async (account, record) => { received.push([account, record]); if (account === "B") throw new Error("temporary outage"); return true; });
  assert.deepEqual(partial.saved, { host: true, guest: false }); assert.ok(partial.nextAttemptAt > now);
  const durable = JSON.parse(JSON.stringify(partial));
  const retried = [];
  const done = await deliverExchange(durable, "room", partial.nextAttemptAt, async (account, record) => { retried.push([account, record]); return true; });
  assert.deepEqual(done.saved, { host: true, guest: true }); assert.equal(retried.length, 1);
  assert.equal(retried[0][0], "B"); assert.deepEqual(retried[0][1], received.find(item => item[0] === "B")[1]);
});
test("exchange wire format rejects missing IDs, unsupported actions and invalid timestamps", () => {
  assert.deepEqual(parseRoomMessage(JSON.stringify({ ...offer, from: "guest" })), offer);
  for (const bad of [{ ...offer, id: "bad" }, { ...offer, action: "delete" }, { ...offer, sentAt: null }, { ...offer, trackId: null }, { ...response("cancel"), exchangeId: "bad" }]) assert.equal(parseRoomMessage(JSON.stringify(bad)), null);
  const base = { id: offer.id, revision: 0, expiresAt: now + 100, closed: false, hostConnected: true, guestConnected: true, playback: { trackId: "a", position: 0, playing: false, updatedAt: now } };
  assert.equal(isRoomSnapshot({ ...base, exchange: pending() }), true);
  assert.equal(isRoomSnapshot({ ...base, exchange: { ...pending(), status: "completed" } }), false);
});
