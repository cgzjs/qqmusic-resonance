import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
import { setupExchangeRoom, ExchangePeer, waitForRecords } from "./exchange-test-helpers.mjs";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const { tracks } = JSON.parse(await readFile(new URL("../lib/resonance/catalog.generated.json", import.meta.url), "utf8"));
async function data(session, body, expected = 200) {
  const response = await fetch(`${base}/api/host/data`, { method: body ? "POST" : "GET", headers: { ...accountHeaders(session), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected); return response.json();
}
test("read receipts persist through login, are idempotent and cannot cross accounts", async () => {
  const a = await mockAccount(base), b = await mockAccount(base);
  const event = { id: crypto.randomUUID(), type: "exchange", trackId: tracks[0].id, receivedTrackId: tracks[1].id, listenerId: `listener-${tracks[0].id}`, scene: "cafe", createdAt: new Date().toISOString() };
  const seeded = await data(a.session, { action: "event", trackId: event.trackId, event });
  assert.deepEqual(seeded.readExchangeIds, []);
  const mark = { action: "readExchange", trackId: "", id: `demo:${event.id}` };
  await data(b.session, mark, 404);
  await data({ ...a.session, token: b.session.token }, mark, 401);
  await data(a.session, { ...mark, id: "demo:unknown" }, 404);
  await data(a.session, mark);
  const repeated = await data(a.session, mark);
  assert.deepEqual(repeated.readExchangeIds, [mark.id]);
  const response = await fetch(`${base}/api/host/resume`, { method: "POST", headers: { "X-Account-Id": a.session.accountId, "Content-Type": "application/json" }, body: JSON.stringify({ deviceKey: a.identity.deviceKey }) });
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.deepEqual((await data(restored)).readExchangeIds, [mark.id]);
  assert.deepEqual((await data(b.session)).readExchangeIds, []);
});

test("online exchange receipts belong to each recipient and replay does not restore unread", async () => {
  const setup = await setupExchangeRoom(base, tracks.slice(0, 2).map(track => track.id));
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount), guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(event => event.room?.hostConnected && event.room.guestConnected);
    await guest.wait(event => event.type === "welcome");
    const offer = host.command("offer", { trackId: tracks[0].id });
    await guest.wait(event => event.room?.exchange?.id === offer.id);
    const reply = guest.command("respond", { exchangeId: offer.id, trackId: tracks[1].id });
    await guest.wait(event => event.requestId === reply.id && !event.error);
    await Promise.all([waitForRecords(base, setup.hostAccount), waitForRecords(base, setup.guestAccount)]);
    const id = `online:${setup.hostTicket.roomId}:${offer.id}`;
    await data(setup.hostAccount.session, { action: "readExchange", trackId: "", id });
    assert.deepEqual((await data(setup.guestAccount.session)).readExchangeIds, []);
    guest.send(reply);
    const hostData = await data(setup.hostAccount.session);
    assert.deepEqual(hostData.readExchangeIds, [id]); assert.equal(hostData.onlineExchanges.length, 1);
  } finally { if (host.socket.readyState === WebSocket.OPEN) host.send({ type: "leave" }); host.close(); guest.close(); }
});
