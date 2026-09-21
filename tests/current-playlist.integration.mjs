import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupExchangeRoom, ExchangePeer, waitForRecords } from "./exchange-test-helpers.mjs";

const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const { tracks } = JSON.parse(await readFile(new URL("../lib/resonance/catalog.generated.json", import.meta.url), "utf8"));

test("current playlist: long positions, all tracks, reconnect, natural end and deduplicated exchange", { timeout: 60000 }, async () => {
  assert.ok(tracks.length >= 2, "Configure at least two tracks for a two-person exchange test");
  const setup = await setupExchangeRoom(base, tracks.slice(0, 2).map(track => track.id));
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount);
  let guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  const transport = (action, values = {}) => host.send({ type: "command", id: crypto.randomUUID(), revision: host.latest.revision, action, ...values });
  try {
    await host.wait(event => event.room?.hostConnected && event.room.guestConnected);
    await guest.wait(event => event.type === "welcome");
    for (const track of tracks) {
      let previous = host.latest.revision;
      transport("track", { trackId: track.id });
      await host.wait(event => event.room?.revision > previous && event.room.playback.trackId === track.id);
      await guest.wait(event => event.room?.revision > previous && event.room.playback.trackId === track.id);
      previous = host.latest.revision;
      const position = Math.min(120, track.duration / 2);
      transport("seek", { position });
      const moved = await guest.wait(event => event.room?.revision > previous && event.room.playback.position === position);
      assert.equal(moved.room.playback.trackId, track.id);
      await host.wait(event => event.room?.revision >= moved.room.revision);
    }
    let previous = host.latest.revision;
    transport("play");
    await host.wait(event => event.room?.revision > previous && event.room.playback.playing);
    previous = host.latest.revision;
    const clientId = guest.clientId;
    guest.close();
    const disconnected = await host.wait(event => event.room?.revision > previous && !event.room.guestConnected);
    assert.equal(disconnected.room.playback.playing, false, "disconnect pauses authoritative playback");
    guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount, clientId);
    const restored = await guest.wait(event => event.type === "welcome");
    assert.equal(restored.room.playback.trackId, tracks.at(-1).id);
    assert.equal(restored.room.playback.playing, false);
    assert.ok(Math.abs(restored.room.playback.position - disconnected.room.playback.position) < .1);
    await host.wait(event => event.room?.revision > disconnected.room.revision && event.room.guestConnected);
    previous = host.latest.revision;
    transport("seek", { position: tracks.at(-1).duration - .3 });
    await host.wait(event => event.room?.revision > previous);
    previous = host.latest.revision;
    transport("play");
    await host.wait(event => event.room?.revision > previous && event.room.playback.playing);
    previous = host.latest.revision;
    // Natural completion is derived from elapsed server time; it is not a new command revision.
    const ended = await guest.wait(event => event.room?.revision === previous && !event.room.playback.playing && Math.abs(event.room.playback.position - tracks.at(-1).duration) < .01, 10000);
    assert.ok(Math.abs(ended.room.playback.position - tracks.at(-1).duration) < .01);
    const offer = host.command("offer", { trackId: tracks[0].id });
    const offered = await host.wait(event => event.requestId === offer.id);
    assert.equal(offered.error, undefined);
    await guest.wait(event => event.room?.exchange?.id === offer.id);
    const reply = guest.command("respond", { exchangeId: offer.id, trackId: tracks[1].id });
    const completed = await guest.wait(event => event.requestId === reply.id);
    assert.equal(completed.error, undefined);
    assert.equal(completed.room.exchange.status, "completed");
    guest.send(reply);
    const [hostData, guestData] = await Promise.all([waitForRecords(base, setup.hostAccount), waitForRecords(base, setup.guestAccount)]);
    assert.equal(hostData.onlineExchanges[0].id, guestData.onlineExchanges[0].id);
    assert.equal(hostData.onlineExchanges[0].sentTrackId, tracks[0].id);
    assert.equal(hostData.onlineExchanges[0].receivedTrackId, tracks[1].id);
  } finally {
    if (host.socket.readyState === WebSocket.OPEN) host.send({ type: "leave" });
    host.close(); guest.close();
  }
});
