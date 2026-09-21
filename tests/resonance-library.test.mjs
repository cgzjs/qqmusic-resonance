import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";
import { emptyLibrary, formatTime, parseLibrary, pickReceivedTrack, updateLibrary } from "../lib/resonance/library.ts";
import { audioTracks, playableListeners, sceneListenerIds } from "../lib/resonance/demo-data.ts";

const tracks = new Set(["a", "b", "c"]);
const listeners = new Set(["listener"]);
const event = { id: "exchange-1", type: "exchange", trackId: "a", receivedTrackId: "b", listenerId: "listener", scene: "metro", createdAt: "2026-09-20T12:00:00.000Z" };

test("saving a received song removes it from later and deduplicates favorites", () => {
  let state = updateLibrary(emptyLibrary, { type: "later", trackId: "b" });
  state = updateLibrary(state, { type: "favorite", trackId: "b" });
  state = updateLibrary(state, { type: "favorite", trackId: "b" });
  state = updateLibrary(state, { type: "later", trackId: "b" });
  assert.deepEqual(state.favoriteIds, ["b"]);
  assert.deepEqual(state.listenLaterIds, []);
  assert.deepEqual(emptyLibrary.favoriteIds, []);
});
test("duplicate responses cannot duplicate exchanges; history is bounded", () => {
  let state = updateLibrary(emptyLibrary, { type: "event", event });
  state = updateLibrary(state, { type: "event", event });
  assert.equal(state.events.length, 1);
  for (let i = 0; i < 320; i++) state = updateLibrary(state, { type: "event", event: { ...event, id: `event-${i}` } });
  assert.equal(state.events.length, 300);
  assert.equal(state.events[0].id, "event-20");
});
test("corrupt, outdated, and invalid stored records are discarded", () => {
  for (const raw of [null, "{invalid", "null", '{"version":2}']) assert.deepEqual(parseLibrary(raw, tracks, listeners), emptyLibrary);
  const raw = JSON.stringify({ version: 1, favoriteIds: ["a", "a", "unknown", 7], listenLaterIds: ["a", "b"], events: [event, event, null, { ...event, id: "bad-date", createdAt: "bad" }, { ...event, id: "bad-source", listenerId: "unknown" }, { ...event, id: "same-track", receivedTrackId: "a" }, { ...event, id: "bad-song", trackId: "unknown" }] });
  const restored = parseLibrary(raw, tracks, listeners);
  assert.deepEqual(restored.favoriteIds, ["a"]);
  assert.deepEqual(restored.listenLaterIds, ["b"]);
  assert.deepEqual(restored.events, [event]);
});
test("library can round-trip through storage and removal stays separate", () => {
  let state = updateLibrary(emptyLibrary, { type: "event", event });
  state = updateLibrary(state, { type: "favorite", trackId: "b" });
  state = updateLibrary(state, { type: "later", trackId: "c" });
  const restored = parseLibrary(JSON.stringify(state), tracks, listeners);
  assert.deepEqual(restored, state);
  assert.deepEqual(updateLibrary(restored, { type: "removeFavorite", trackId: "b" }).listenLaterIds, ["c"]);
  assert.deepEqual(updateLibrary(restored, { type: "removeLater", trackId: "c" }).favoriteIds, ["b"]);
});
test("exchange returns a different available song and rotates responses", () => {
  assert.equal(pickReceivedTrack("a", ["a", "b", "c"], 0), "b");
  assert.equal(pickReceivedTrack("a", ["a", "b", "c"], 1), "c");
  assert.equal(pickReceivedTrack("a", ["a"], 0), null);
});
test("player time formatting handles absent metadata and track boundaries", () => {
  assert.equal(formatTime(NaN), "00:00");
  assert.equal(formatTime(-5), "00:00");
  assert.equal(formatTime(24.7), "00:24");
  assert.equal(formatTime(391), "06:31");
});

test("playable scene metadata points to matching local tracks and valid suggestions", () => {
  const catalog = new Map(audioTracks.map(track => [track.id, track]));
  const ids = new Set(playableListeners.map(listener => listener.id));
  for (const listener of playableListeners) {
    const track = catalog.get(listener.audioTrackId);
    assert.ok(track);
    assert.equal(listener.track, track.track);
    assert.equal(listener.artist, track.artist);
    assert.ok(listener.suggestions.every(song => catalog.has(song.id)));
  }
  assert.equal(sceneListenerIds.metro.length, audioTracks.length);
  assert.equal(playableListeners.length, audioTracks.length);
  assert.ok(Object.values(sceneListenerIds).flat().every(id => ids.has(id)));
});

test("prepared catalog duration and byte size match the configured audio assets", async () => {
  for (const track of audioTracks) {
    const file = readFileSync(new URL(`../public${track.audioUrl}`, import.meta.url));
    const metadata = await parseFile(fileURLToPath(new URL(`../public${track.audioUrl}`, import.meta.url)), { duration: true });
    assert.equal(file.length, track.byteLength);
    assert.ok(Math.abs(metadata.format.duration - track.duration) < .01);
  }
});
