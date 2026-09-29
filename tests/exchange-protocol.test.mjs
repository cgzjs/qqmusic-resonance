import test from "node:test";
import assert from "node:assert/strict";
import { sendGift, deliverExchange, exchangeRecord } from "../lib/resonance/exchange-protocol.ts";
import { parseRoomMessage, isRoomSnapshot, isRoomExchange } from "../lib/resonance/room-protocol.ts";
const now = 1_000_000;
const tracks = ["a", "b", "c"];
const offer = { type: "exchange", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", action: "offer", trackId: "a", sentAt: now };
const gift = () => sendGift("host", offer, now, true, tracks).exchange;

test("sending a song completes at once and records one side per account", () => {
  const state = gift();
  assert.equal(state.status, "completed");
  assert.equal(state.completedAt, now);
  assert.equal(state.responseTrackId, undefined);
  assert.equal(isRoomExchange(state), true);
  assert.deepEqual(exchangeRecord("room", state, "host"), { id: offer.id, roomId: "room", sentTrackId: "a", completedAt: now });
  assert.deepEqual(exchangeRecord("room", state, "guest"), { id: offer.id, roomId: "room", receivedTrackId: "a", completedAt: now });
});

test("a gift needs both listeners online, a catalog track and a fresh timestamp", () => {
  assert.equal(sendGift("host", offer, now, false, tracks).error, "PEER_OFFLINE");
  assert.equal(sendGift("host", { ...offer, trackId: "foreign" }, now, true, tracks).error, "INVALID_TRACK");
  assert.equal(sendGift("host", offer, now + 10_001, true, tracks).error, "EXCHANGE_STALE");
  assert.equal(sendGift("host", { ...offer, sentAt: now + 2000 }, now, true, tracks).error, "EXCHANGE_STALE");
});

test("legacy two-way exchanges still record both songs; unfinished ones are not valid state", () => {
  const legacy = { ...gift(), responseTrackId: "b" };
  assert.equal(isRoomExchange(legacy), true);
  assert.deepEqual(exchangeRecord("room", legacy, "host"), { id: offer.id, roomId: "room", sentTrackId: "a", receivedTrackId: "b", completedAt: now });
  assert.deepEqual(exchangeRecord("room", legacy, "guest"), { id: offer.id, roomId: "room", sentTrackId: "b", receivedTrackId: "a", completedAt: now });
  assert.equal(isRoomExchange({ ...legacy, responseTrackId: "a" }), false);
  for (const status of ["pending", "declined", "cancelled", "expired", "ended"]) assert.equal(isRoomExchange({ ...gift(), status }), false);
});

test("partial account failure retains durable retry state, stable IDs and successful side", async () => {
  const item = { exchange: gift(), accounts: { host: "A", guest: "B" }, saved: { host: false, guest: false }, attempts: 0, nextAttemptAt: now };
  const received = [];
  const partial = await deliverExchange(item, "room", now, async (account, record) => { received.push([account, record]); if (account === "B") throw new Error("temporary outage"); return true; });
  assert.deepEqual(partial.saved, { host: true, guest: false }); assert.ok(partial.nextAttemptAt > now);
  const durable = JSON.parse(JSON.stringify(partial));
  const retried = [];
  const done = await deliverExchange(durable, "room", partial.nextAttemptAt, async (account, record) => { retried.push([account, record]); return true; });
  assert.deepEqual(done.saved, { host: true, guest: true }); assert.equal(retried.length, 1);
  assert.equal(retried[0][0], "B"); assert.deepEqual(retried[0][1], received.find(item => item[0] === "B")[1]);
  assert.equal(retried[0][1].receivedTrackId, "a");
});

test("gift wire format only accepts offer with an ID, track and timestamp", () => {
  assert.deepEqual(parseRoomMessage(JSON.stringify({ ...offer, from: "guest", exchangeId: offer.id })), offer);
  for (const bad of [{ ...offer, id: "bad" }, { ...offer, action: "respond", exchangeId: offer.id }, { ...offer, action: "decline", exchangeId: offer.id }, { ...offer, action: "cancel", exchangeId: offer.id }, { ...offer, sentAt: null }, { ...offer, trackId: null }]) assert.equal(parseRoomMessage(JSON.stringify(bad)), null);
  const base = { id: offer.id, revision: 0, expiresAt: now + 100, closed: false, hostConnected: true, guestConnected: true, playback: { trackId: "a", position: 0, playing: false, updatedAt: now } };
  assert.equal(isRoomSnapshot({ ...base, exchange: gift() }), true);
  assert.equal(isRoomSnapshot({ ...base, exchange: null }), true);
  assert.equal(isRoomSnapshot({ ...base, exchange: { ...gift(), status: "pending" } }), false);
});
