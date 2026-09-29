import test from "node:test";
import assert from "node:assert/strict";
import { setupExchangeRoom, ExchangePeer, accountData, waitForRecords } from "./exchange-test-helpers.mjs";
import { accountHeaders } from "./host-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
test("gift: both sides can send at once, retries are idempotent, reconnect restores it, records survive room end", async () => {
  const setup = await setupExchangeRoom(base);
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount);
  let guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.guestConnected && event.room.hostConnected);
    await guest.wait(event => event.type === "welcome");
    const playback = host.latest.playback;
    const fromHost = host.command("offer", { trackId: "demo-night" });
    const fromGuest = guest.command("offer", { trackId: "demo-dawn" });
    const hostResult = await host.wait(event => event.requestId === fromHost.id);
    const guestResult = await guest.wait(event => event.requestId === fromGuest.id);
    assert.equal(hostResult.error, undefined); assert.equal(guestResult.error, undefined);
    assert.equal(hostResult.room.exchange.status, "completed");
    assert.equal(hostResult.room.playback.trackId, playback.trackId); assert.equal(hostResult.room.playback.playing, false);
    const foreign = host.command("offer", { trackId: "not-in-catalog" });
    assert.equal((await host.wait(event => event.requestId === foreign.id)).error, "INVALID_TRACK");
    // Old two-way actions are no longer part of the protocol.
    const legacy = guest.command("respond", { exchangeId: fromHost.id, trackId: "demo-breeze" });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(guest.events.some(event => event.requestId === legacy.id && !event.error), false);
    const guestId = guest.clientId; guest.close();
    await host.wait(event => event.room && !event.room.guestConnected);
    guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount, guestId);
    const restored = await guest.wait(event => event.type === "welcome");
    assert.equal(restored.room.exchange.status, "completed");
    guest.send(fromGuest);
    assert.equal((await guest.wait(event => event.requestId === fromGuest.id)).error, undefined);
    // End immediately, while account deliveries may still run.
    host.send({ type: "leave" });
    const [hostData, guestData] = await Promise.all([waitForRecords(base, setup.hostAccount, 2), waitForRecords(base, setup.guestAccount, 2)]);
    const byId = (data, id) => data.onlineExchanges.find(item => item.id === id);
    assert.deepEqual([byId(hostData, fromHost.id).sentTrackId, byId(hostData, fromHost.id).receivedTrackId], ["demo-night", undefined]);
    assert.deepEqual([byId(guestData, fromHost.id).sentTrackId, byId(guestData, fromHost.id).receivedTrackId], [undefined, "demo-night"]);
    assert.equal(byId(hostData, fromGuest.id).receivedTrackId, "demo-dawn");
    assert.equal(byId(guestData, fromGuest.id).sentTrackId, "demo-dawn");
    assert.deepEqual(hostData.favoriteIds, []); assert.deepEqual(guestData.listenLaterIds, []);
    const forge = await fetch(`${base}/api/host/record-exchange`, { method: "POST", headers: { ...accountHeaders(setup.hostAccount.session), "Content-Type": "application/json" }, body: JSON.stringify({ record: hostData.onlineExchanges[0] }) });
    assert.equal(forge.status, 404);
  } finally { host.close(); guest.close(); }
});

test("a gift needs both listeners online; playback stays independent", async () => {
  const setup = await setupExchangeRoom(base);
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount), guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.guestConnected && event.room.hostConnected); await guest.wait(event => event.type === "welcome");
    guest.close();
    await host.wait(event => event.room && !event.room.guestConnected);
    const offline = host.command("offer", { trackId: "demo-night" });
    assert.equal((await host.wait(event => event.requestId === offline.id)).error, "PEER_OFFLINE");
    assert.deepEqual((await accountData(base, setup.hostAccount)).onlineExchanges, []);
  } finally { host.send({ type: "leave" }); host.close(); guest.close(); }
});
