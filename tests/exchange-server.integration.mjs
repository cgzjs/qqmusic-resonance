import test from "node:test";
import assert from "node:assert/strict";
import { setupExchangeRoom, ExchangePeer, accountData, waitForRecords } from "./exchange-test-helpers.mjs";
import { accountHeaders } from "./host-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
test("real exchange: competing offers, permissions, reconnect, response and account persistence after room ends", async () => {
  const setup = await setupExchangeRoom(base);
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount);
  let guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.guestConnected && event.room.hostConnected);
    await guest.wait(event => event.type === "welcome");
    const playback = host.latest.playback;
    const first = host.command("offer", { trackId: "demo-night" });
    const competing = guest.command("offer", { trackId: "demo-dawn" });
    const firstResult = await host.wait(event => event.requestId === first.id);
    const competingResult = await guest.wait(event => event.requestId === competing.id);
    assert.equal(Number(!firstResult.error) + Number(!competingResult.error), 1);
    const sender = firstResult.error ? guest : host, recipient = firstResult.error ? host : guest;
    const offer = firstResult.error ? competing : first;
    const accepted = firstResult.error ? competingResult : firstResult;
    assert.equal(accepted.room.exchange.status, "pending");
    const forbidden = sender.command("respond", { exchangeId: offer.id, trackId: "demo-breeze" });
    assert.equal((await sender.wait(event => event.requestId === forbidden.id)).error, "EXCHANGE_FORBIDDEN");
    const repeated = recipient.command("respond", { exchangeId: offer.id, trackId: offer.trackId });
    assert.equal((await recipient.wait(event => event.requestId === repeated.id)).error, "EXCHANGE_INVALID_REPLY");
    const guestId = guest.clientId; guest.close();
    await host.wait(event => event.room && !event.room.guestConnected && event.room.exchange?.id === offer.id);
    guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount, guestId);
    const restored = await guest.wait(event => event.type === "welcome");
    assert.equal(restored.room.exchange.id, offer.id); assert.equal(restored.room.exchange.status, "pending");
    const responding = accepted.room.exchange.from === "host" ? guest : host;
    const reply = responding.command("respond", { exchangeId: offer.id, trackId: "demo-breeze" });
    const completed = await responding.wait(event => event.requestId === reply.id);
    assert.equal(completed.error, undefined); assert.equal(completed.room.exchange.status, "completed");
    assert.equal(completed.room.playback.trackId, playback.trackId); assert.equal(completed.room.playback.playing, false);
    responding.send(reply);
    // End immediately after completion, while account deliveries may still run.
    host.send({ type: "leave" });
    const [hostData, guestData] = await Promise.all([waitForRecords(base, setup.hostAccount), waitForRecords(base, setup.guestAccount)]);
    assert.equal(hostData.onlineExchanges[0].id, guestData.onlineExchanges[0].id);
    assert.equal(hostData.onlineExchanges[0].sentTrackId, guestData.onlineExchanges[0].receivedTrackId);
    assert.deepEqual(hostData.favoriteIds, []); assert.deepEqual(guestData.listenLaterIds, []);
    const saved = await fetch(`${base}/api/host/data`, { method: "POST", headers: { ...accountHeaders(setup.hostAccount.session), "Content-Type": "application/json" }, body: JSON.stringify({ action: "favorite", trackId: hostData.onlineExchanges[0].receivedTrackId }) });
    assert.equal(saved.status, 200);
    assert.equal((await accountData(base, setup.hostAccount)).onlineExchanges.length, 1);
    const forge = await fetch(`${base}/api/host/record-exchange`, { method: "POST", headers: { ...accountHeaders(setup.hostAccount.session), "Content-Type": "application/json" }, body: JSON.stringify({ record: hostData.onlineExchanges[0] }) });
    assert.equal(forge.status, 404);
  } finally { host.close(); guest.close(); }
});

test("cancel, decline and real 60-second expiry are terminal; playback stays independent", { timeout: 85000 }, async () => {
  const setup = await setupExchangeRoom(base);
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount), guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.guestConnected && event.room.hostConnected); await guest.wait(event => event.type === "welcome");
    for (const action of ["cancel", "decline"]) {
      const offer = host.command("offer", { trackId: "demo-night" }); await host.wait(event => event.requestId === offer.id);
      const actor = action === "cancel" ? host : guest;
      const terminal = actor.command(action, { exchangeId: offer.id });
      assert.equal((await actor.wait(event => event.requestId === terminal.id)).room.exchange.status, action === "cancel" ? "cancelled" : "declined");
      const late = guest.command("respond", { exchangeId: offer.id, trackId: "demo-glass" });
      assert.equal((await guest.wait(event => event.requestId === late.id)).error, "EXCHANGE_FINISHED");
    }
    const offer = guest.command("offer", { trackId: "demo-dawn" }); await guest.wait(event => event.requestId === offer.id);
    await host.wait(event => event.room?.exchange?.id === offer.id && event.room.exchange.status === "expired", 65000);
    const expired = host.command("respond", { exchangeId: offer.id, trackId: "demo-glass" });
    assert.equal((await host.wait(event => event.requestId === expired.id)).error, "EXCHANGE_FINISHED");
    assert.deepEqual((await accountData(base, setup.hostAccount)).onlineExchanges, []);
  } finally { host.send({ type: "leave" }); host.close(); guest.close(); }
});
