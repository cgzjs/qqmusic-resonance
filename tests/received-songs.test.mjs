import test from "node:test";
import assert from "node:assert/strict";
import { receivedSongs, exchangesOnDay } from "../lib/resonance/received-songs.ts";

test("received songs keep separate deliveries of the same track and distinguish sources", () => {
  const event = { id: "one", type: "exchange", trackId: "a", receivedTrackId: "b", createdAt: "2026-09-21T01:00:00Z" };
  const data = { events: [event, event, { ...event, id: "two" }, { ...event, id: "listen", type: "listen" }], onlineExchanges: [{ id: "one", roomId: "room", sentTrackId: "a", receivedTrackId: "b", completedAt: Date.parse(event.createdAt) + 100 }], readExchangeIds: ["demo:one"] };
  const items = receivedSongs(data);
  assert.equal(items.length, 3);
  assert.equal(items[0].id, "online:room:one");
  assert.deepEqual(new Set(items.filter(item => item.unread).map(item => item.id)), new Set(["demo:two", "online:room:one"]));
  assert.equal(items.every(item => item.receivedTrackId === "b"), true);
});

test("legacy accounts without receipts can derive their migration read ids", () => {
  const items = receivedSongs({ events: [{ id: "old", type: "exchange", trackId: "removed-a", receivedTrackId: "removed-b", createdAt: "2026-09-20T01:00:00Z" }], onlineExchanges: [] });
  assert.deepEqual(items.map(item => item.id), ["demo:old"]);
  assert.equal(receivedSongs({ events: [], onlineExchanges: [], readExchangeIds: ["demo:old"] }).length, 0);
});

test("daily exchanges combine completed sources without counting retries, reads or pending replies", () => {
  const now = new Date(2026, 8, 21, 12);
  const local = { id: "same-id", type: "exchange", trackId: "a", receivedTrackId: "b", createdAt: now.toISOString() };
  const online = { id: "same-id", roomId: "room-a", sentTrackId: "a", receivedTrackId: "b", completedAt: now.getTime() };
  const data = { events: [local, local, { ...local, id: "second" }, { ...local, id: "listen", type: "listen" }, { ...local, id: "unfinished", receivedTrackId: undefined }], onlineExchanges: [online, online, { ...online, roomId: "room-b" }], readExchangeIds: ["demo:same-id"], demoReplies: [{ status: "pending" }] };
  assert.equal(exchangesOnDay(receivedSongs(data), now), 4);
  assert.equal(exchangesOnDay(receivedSongs({ ...data, readExchangeIds: [] }), now), 4);
  assert.equal(exchangesOnDay(receivedSongs({ ...data, events: [], onlineExchanges: [] }), now), 0);
});

test("exchange day uses local completion time including midnight and year boundaries", () => {
  const day = new Date(2027, 0, 1, 12);
  const midnight = new Date(2027, 0, 1).getTime();
  const nextDay = new Date(2027, 0, 2).getTime();
  const data = { events: [], onlineExchanges: [midnight - 1, midnight, nextDay - 1, nextDay].map((completedAt, index) => ({ id: String(index), roomId: "r", sentTrackId: "removed-a", receivedTrackId: "removed-b", completedAt })), readExchangeIds: [] };
  assert.equal(exchangesOnDay(receivedSongs(data), day), 2);
  assert.equal(exchangesOnDay(receivedSongs(data), new Date(2026, 11, 31, 23)), 1);
});
