import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../lib/resonance/catalog.generated.json" with { type: "json" };
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
import { setupExchangeRoom, ExchangePeer, waitForRecords } from "./exchange-test-helpers.mjs";

const base = process.env.PUBLIC_DEMO_TEST_URL ?? "http://127.0.0.1:8788";
const call = async (path, session, body) => fetch(`${base}/api/${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(session ? accountHeaders(session) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

test("production preview admits isolated visitors, persists their data, and rejects forged sessions", async () => {
  const config = await (await call("host/config")).json();
  assert.equal(config.demo, false); assert.equal(config.preview, true); assert.equal(config.realHostConfigured, false);
  const a = await mockAccount(base), b = await mockAccount(base, "模拟听众 B");
  let restored = a.session;
  try {
    assert.equal(a.session.mode, "preview"); assert.equal(b.session.mode, "preview");
    assert.notEqual(a.session.accountId, b.session.accountId);
    assert.equal((await call("host/data", a.session, { action: "favorite", trackId: catalog.tracks[0].id })).status, 200);
    assert.deepEqual((await (await call("host/data", b.session)).json()).favoriteIds, []);
    assert.equal((await call("host/data", { ...b.session, accountId: a.session.accountId })).status, 401);
    const resumed = await call("host/resume", a.session, { deviceKey: a.identity.deviceKey });
    assert.equal(resumed.status, 200); restored = await resumed.json();
    assert.deepEqual((await (await call("host/data", restored)).json()).favoriteIds, [catalog.tracks[0].id]);
    assert.equal((await call("rooms", restored, { trackId: catalog.tracks[0].id })).status, 403);
    assert.equal((await call("host/preview-rate", restored, {})).status, 404);
    // Repeated early rejections must keep their status instead of aborting the upload stream.
    for (let attempt = 0; attempt < 6; attempt++) {
      const crossOrigin = await fetch(`${base}/api/host/create`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://foreign.example.test" }, body: JSON.stringify({ displayName: "模拟听众 A" }) });
      const rejected = await crossOrigin.json().catch(() => ({ error: "NON_JSON_RESPONSE" }));
      assert.equal(crossOrigin.status, 403, `Cross-origin rejection: ${rejected.error}`);
    }
    assert.equal((await call("host/create", null, { displayName: "模拟听众 A", padding: "x".repeat(2048) })).status, 413);
    assert.equal((await call("host/logout", a.session, { scope: "session" })).status, 200);
    assert.equal((await call("host/data", a.session)).status, 401);
    assert.equal((await call("host/data", restored)).status, 200);
  } finally {
    await call("host/logout", restored, {}); await call("host/logout", b.session, {});
  }
});

test("production preview room authenticates both roles and saves sent and received songs into preview accounts", async () => {
  const setup = await setupExchangeRoom(base, catalog.tracks.slice(0, 2).map(track => track.id));
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount);
  const guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.hostConnected && event.room.guestConnected);
    await guest.wait(event => event.type === "welcome");
    const offer = host.command("offer", { trackId: catalog.tracks[0].id });
    await guest.wait(event => event.room?.exchange?.id === offer.id);
    const sent = await waitForRecords(base, setup.hostAccount);
    const received = await waitForRecords(base, setup.guestAccount);
    assert.equal(sent.onlineExchanges[0].sentTrackId, catalog.tracks[0].id);
    assert.equal(received.onlineExchanges[0].receivedTrackId, catalog.tracks[0].id);
    host.send({ type: "leave" });
    await guest.wait(event => event.room?.closed);
  } finally {
    host.close(); guest.close();
    await call("host/logout", setup.hostAccount.session, {}); await call("host/logout", setup.guestAccount.session, {});
  }
});

test("both accounts can reconnect to their reserved seats; disconnect pauses and explicit exit closes the room", async () => {
  const setup = await setupExchangeRoom(base, catalog.tracks.slice(0, 2).map(track => track.id));
  const peers = [];
  const connect = (ticket, account, clientId) => {
    const peer = new ExchangePeer(base, ticket, account, clientId);
    peers.push(peer); return peer;
  };
  let host = connect(setup.hostTicket, setup.hostAccount);
  let guest = connect(setup.guestTicket, setup.guestAccount);
  const status = () => fetch(`${base}/api/rooms/${setup.hostTicket.roomId}/status`);
  try {
    await host.wait(event => event.room?.hostConnected && event.room.guestConnected);
    await guest.wait(event => event.type === 'welcome');
    host.send({ type: 'command', id: crypto.randomUUID(), revision: host.latest.revision, action: 'play' });
    await guest.wait(event => event.room?.playback.playing);
    const firstRevision = guest.latest.revision;
    const hostClientId = host.clientId;
    host.close();
    const paused = await guest.wait(event => event.room?.revision > firstRevision && !event.room.hostConnected);
    assert.equal(paused.room.closed, false); assert.equal(paused.room.playback.playing, false);
    assert.equal((await status()).status, 200);
    host = connect(setup.hostTicket, setup.hostAccount, hostClientId);
    const restoredHost = await host.wait(event => event.type === 'welcome');
    assert.equal(restoredHost.role, 'host'); assert.equal(restoredHost.room.guestConnected, true);
    assert.equal(restoredHost.room.playback.playing, false);
    const revision = restoredHost.room.revision;
    const guestClientId = guest.clientId;
    guest.close();
    const guestOffline = await host.wait(event => event.room?.revision > revision && !event.room.guestConnected);
    assert.equal(guestOffline.room.closed, false); assert.equal((await status()).status, 200);
    guest = connect(setup.guestTicket, setup.guestAccount, guestClientId);
    const restoredGuest = await guest.wait(event => event.type === 'welcome');
    assert.equal(restoredGuest.role, 'guest'); assert.equal(restoredGuest.room.hostConnected, true);
    assert.equal(restoredGuest.room.playback.trackId, catalog.tracks[1].id);
    const joined = await host.wait(event => event.room?.revision > guestOffline.room.revision && event.room.guestConnected);
    host.send({ type: 'command', id: crypto.randomUUID(), revision: joined.room.revision, action: 'seek', position: 42 });
    const seeked = await host.wait(event => event.room?.revision > joined.room.revision && event.room.playback.position === 42);
    host.send({ type: 'command', id: crypto.randomUUID(), revision: seeked.room.revision, action: 'play' });
    const playing = await guest.wait(event => event.room?.revision > seeked.room.revision && event.room.playback.playing);
    assert.ok(playing.room.playback.position >= 42 && playing.room.playback.position < 44);
    guest.send({ type: 'leave' });
    await host.wait(event => event.room?.closed);
    assert.equal((await status()).status, 404);
  } finally {
    peers.forEach(peer => peer.close());
    await call('host/logout', setup.hostAccount.session, {}); await call('host/logout', setup.guestAccount.session, {});
  }
});
