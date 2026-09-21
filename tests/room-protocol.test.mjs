import test from "node:test";
import assert from "node:assert/strict";
import { applyRoomCommand, clockOffset, isRoomSnapshot, parseRoomMessage, playbackPosition, settledPlayback } from "../lib/resonance/room-protocol.ts";

const now = 1_000_000;
const snapshot = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 4, expiresAt: now + 60_000, closed: false, hostConnected: true, guestConnected: true, playback: { trackId: "song-a", position: 3, playing: true, updatedAt: now - 2000 } };
const durations = { "song-a": 24, "song-b": 24 };
const command = (action, extra = {}) => ({ type: "command", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", revision: 4, action, ...extra });

test("playing time advances by server elapsed time and never exceeds duration", () => {
  assert.equal(playbackPosition(snapshot.playback, now, 24), 5);
  assert.equal(playbackPosition(snapshot.playback, now + 100000, 24), 24);
  assert.equal(playbackPosition({ ...snapshot.playback, playing: false }, now, 24), 3);
  assert.equal(playbackPosition(snapshot.playback, now - 10000, 24), 3);
});
test("guest transport commands, stale versions and expired rooms are rejected", () => {
  assert.equal(applyRoomCommand(snapshot, "guest", command("play"), now, durations).error, "HOST_ONLY");
  assert.equal(applyRoomCommand(snapshot, "host", command("pause", { revision: 3 }), now, durations).error, "STALE_REVISION");
  assert.equal(applyRoomCommand(snapshot, "host", command("play"), snapshot.expiresAt, durations).error, "ROOM_CLOSED");
});
test("pause freezes authoritative time; seek is clamped and play restarts ended audio", () => {
  const paused = applyRoomCommand(snapshot, "host", command("pause"), now, durations);
  assert.deepEqual(paused, { ok: true, playback: { trackId: "song-a", position: 5, playing: false, updatedAt: now } });
  assert.equal(applyRoomCommand(snapshot, "host", command("seek", { position: -7 }), now, durations).playback.position, 0);
  const end = applyRoomCommand(snapshot, "host", command("seek", { position: 100 }), now, durations).playback;
  assert.equal(end.position, 24); assert.equal(end.playing, false);
  assert.equal(applyRoomCommand({ ...snapshot, playback: end }, "host", command("play"), now, durations).playback.position, 0);
});
test("track selection only accepts the fixed catalog and resets the timeline", () => {
  assert.equal(applyRoomCommand(snapshot, "host", command("track", { trackId: "https://bad.test/audio" }), now, durations).error, "INVALID_TRACK");
  assert.equal(applyRoomCommand(snapshot, "host", command("track", { trackId: "__proto__" }), now, durations).error, "INVALID_TRACK");
  assert.deepEqual(applyRoomCommand(snapshot, "host", command("track", { trackId: "song-b" }), now, durations).playback, { trackId: "song-b", position: 0, playing: true, updatedAt: now });
});
test("protocol rejects malformed, oversized, non-finite and incomplete commands", () => {
  for (const raw of ["bad", "x".repeat(4097), "null", '{"type":"ping","sentAt":"abc"}', JSON.stringify(command("seek")), JSON.stringify(command("seek", { position: null })), JSON.stringify(command("play", { revision: -1 }))]) assert.equal(parseRoomMessage(raw), null);
  assert.deepEqual(parseRoomMessage(JSON.stringify(command("seek", { position: 10 }))), command("seek", { position: 10 }));
});
test("clock offset compensates a five-minute clock skew using RTT midpoint", () => {
  assert.equal(clockOffset(300000, 300100, 1050), -299000);
  assert.equal(300100 + clockOffset(300000, 300100, 1050), 1100);
  assert.equal(isRoomSnapshot(snapshot), true);
  assert.equal(isRoomSnapshot({ ...snapshot, playback: { ...snapshot.playback, position: NaN } }), false);
});

test("an ended snapshot stays at duration instead of rewinding to the initial anchor", () => {
  const ended = settledPlayback({ trackId: "song-a", position: 0, playing: true, updatedAt: now - 25000 }, now, 24);
  assert.equal(ended.playing, false);
  assert.equal(ended.position, 24);
  assert.equal(playbackPosition(ended, now + 1000, 24), 24);
});

test("reaction protocol accepts only fixed kinds, valid IDs and timestamped track context", () => {
  const valid = { type: "reaction", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kind: "wave", trackId: "demo-night", sentAt: now };
  assert.deepEqual(parseRoomMessage(JSON.stringify({ ...valid, from: "host" })), valid);
  assert.deepEqual(parseRoomMessage(JSON.stringify({ type: "reaction-received", id: valid.id })), { type: "reaction-received", id: valid.id });
  for (const bad of [{ ...valid, kind: "arbitrary-html" }, { ...valid, sentAt: null }, { ...valid, id: "bad" }, { ...valid, trackId: "x".repeat(65) }, { type: "reaction-received", id: "bad" }]) assert.equal(parseRoomMessage(JSON.stringify(bad)), null);
});
