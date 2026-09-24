import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
import { setupExchangeRoom, ExchangePeer, accountData } from "./exchange-test-helpers.mjs";

const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const { tracks } = JSON.parse(await readFile(new URL("../lib/resonance/catalog.generated.json", import.meta.url), "utf8"));
async function call(action, account, body, token, status = 200) {
  const response = await fetch(`${base}/api/nearby/${action}`, { method: body ? "POST" : "GET", headers: { ...accountHeaders(account.session), "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, status, `${action}: expected ${status}, got ${response.status}`);
  return response.json();
}
const start = account => call("start", account, { trackId: tracks[0].id }, null, 201);
const state = (account, presence) => call("state", account, undefined, presence.token);
const stop = (account, presence) => call("stop", account, {}, presence.token);

test("account blocks survive new presence and login, hide both ways, remain private and unblock only for the owner", async () => {
  const a = await mockAccount(base), b = await mockAccount(base), c = await mockAccount(base);
  let ap = await start(a), bp = await start(b);
  try {
    const before = await accountData(base, a);
    const blocked = await call("block", a, { targetId: bp.self.id });
    assert.equal(blocked.blocks.length, 1);
    assert.deepEqual(Object.keys(blocked.blocks[0]).sort(), ["alias", "createdAt", "id"]);
    assert.ok(!JSON.stringify(blocked).includes(b.identity.accountId));
    assert.deepEqual((await call("block", a, { targetId: bp.self.id })).blocks, blocked.blocks);
    assert.ok(!(await state(a, ap)).peers.some(p => p.id === bp.self.id));
    assert.ok(!(await state(b, bp)).peers.some(p => p.id === ap.self.id));
    await call("invite", b, { targetId: ap.self.id }, bp.token, 409);
    await call("invite", a, { targetId: bp.self.id }, ap.token, 409);
    await call("unblock", c, { id: blocked.blocks[0].id });
    assert.deepEqual((await call("blocks", a)).blocks, blocked.blocks);
    assert.deepEqual(await accountData(base, a), before, "blocking leaves music records intact");
    await stop(a, ap); await stop(b, bp);
    const resumed = await fetch(`${base}/api/host/resume`, { method: "POST", headers: { ...accountHeaders(a.session), "Content-Type": "application/json" }, body: JSON.stringify({ deviceKey: a.identity.deviceKey }) });
    assert.equal(resumed.status, 200); a.session = await resumed.json();
    ap = await start(a); bp = await start(b);
    assert.ok(!(await state(a, ap)).peers.some(p => p.id === bp.self.id));
    await call("unblock", a, { id: blocked.blocks[0].id });
    assert.ok((await state(a, ap)).peers.some(p => p.id === bp.self.id));
    assert.ok((await state(b, bp)).peers.some(p => p.id === ap.self.id));
    assert.deepEqual((await call("unblock", a, { id: blocked.blocks[0].id })).blocks, []);
  } finally { await stop(a, ap); await stop(b, bp); }
});

test("blocking cancels a pending invitation and one-sided unblock does not override the other person's block", async () => {
  const a = await mockAccount(base), b = await mockAccount(base);
  const ap = await start(a), bp = await start(b);
  try {
    const invited = await call("invite", a, { targetId: bp.self.id }, ap.token);
    const blockB = await call("block", b, { targetId: ap.self.id });
    assert.equal((await state(a, ap)).invite.status, "cancelled");
    await call("respond", b, { inviteId: invited.invite.id, decision: "accept" }, bp.token, 409);
    const blockA = await call("block", a, { targetId: bp.self.id });
    await call("unblock", b, { id: blockB.blocks[0].id });
    assert.ok(!(await state(a, ap)).peers.some(p => p.id === bp.self.id));
    await call("unblock", a, { id: blockA.blocks[0].id });
    assert.ok((await state(a, ap)).peers.some(p => p.id === bp.self.id));
    assert.equal((await state(a, ap)).invite.status, "cancelled", "unblock never revives old invitations");
  } finally { await stop(a, ap); await stop(b, bp); }
});

test("room blocking stops both clients and pending exchanges; unrelated accounts cannot block a room", async () => {
  const setup = await setupExchangeRoom(base, tracks.slice(0, 2).map(t => t.id));
  const stranger = await mockAccount(base);
  const host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount);
  const guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
  try {
    await host.wait(e => e.room?.hostConnected && e.room.guestConnected);
    await guest.wait(e => e.type === "welcome");
    await call("block", stranger, { roomId: setup.hostTicket.roomId }, null, 409);
    host.send({ type: "command", id: crypto.randomUUID(), revision: host.latest.revision, action: "play" });
    await guest.wait(e => e.room?.playback.playing);
    const offer = host.command("offer", { trackId: tracks[0].id });
    await guest.wait(e => e.room?.exchange?.id === offer.id);
    const blocked = await call("block", setup.guestAccount, { roomId: setup.guestTicket.roomId });
    assert.equal(blocked.closing, false);
    for (const client of [host, guest]) {
      const closed = await client.wait(e => e.room?.closed);
      assert.equal(closed.room.playback.playing, false);
      assert.equal(closed.room.exchange.status, "ended");
    }
    assert.deepEqual((await call("block", setup.guestAccount, { roomId: setup.guestTicket.roomId })).blocks, blocked.blocks);
    await call("unblock", setup.guestAccount, { id: blocked.blocks[0].id });
    assert.equal((await fetch(`${base}/api/rooms/${setup.hostTicket.roomId}/status`)).status, 404);
    assert.equal((await accountData(base, setup.hostAccount)).onlineExchanges.length, 0);
  } finally { host.close(); guest.close(); }
});

test("racing accept and block cannot leave a usable room or an accepted ticket", async () => {
  const a = await mockAccount(base), b = await mockAccount(base);
  const ap = await start(a), bp = await start(b);
  try {
    const invited = await call("invite", a, { targetId: bp.self.id }, ap.token);
    const [accepted, block] = await Promise.all([
      fetch(`${base}/api/nearby/respond`, { method: "POST", headers: { ...accountHeaders(b.session), Authorization: `Bearer ${bp.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ inviteId: invited.invite.id, decision: "accept" }) }),
      call("block", a, { targetId: bp.self.id }),
    ]);
    assert.ok([200, 409].includes(accepted.status));
    const result = await accepted.json();
    if (result.ticket) assert.equal((await fetch(`${base}/api/rooms/${result.ticket.roomId}/status`)).status, 404);
    assert.equal((await state(a, ap)).ticket, null);
    assert.equal((await state(b, bp)).ticket, null);
    assert.equal(block.blocks.length, 1);
  } finally { await stop(a, ap); await stop(b, bp); }
});

test("safety endpoints require authentication, validate input, and never expose internal room closure", async () => {
  const a = await mockAccount(base), ap = await start(a);
  try {
    assert.equal((await fetch(`${base}/api/nearby/blocks`)).status, 401);
    const crossOrigin = await fetch(`${base}/api/nearby/blocks`, { headers: { ...accountHeaders(a.session), Origin: "https://example.invalid" } });
    assert.equal(crossOrigin.status, 403);
    await call("block", a, { targetId: ap.self.id }, null, 409);
    await call("block", a, { targetId: "bad" }, null, 400);
    await call("block", a, { targetId: ap.self.id, roomId: crypto.randomUUID() }, null, 400);
    await call("unblock", a, { id: "bad" }, null, 400);
    assert.equal((await fetch(`${base}/api/rooms/${crypto.randomUUID()}/close-for-block`, { method: "POST" })).status, 404);
  } finally { await stop(a, ap); }
});
