import test from "node:test";
import assert from "node:assert/strict";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
import catalog from "../lib/resonance/catalog.generated.json" with { type: "json" };

const [firstTrack, secondTrack, thirdTrack] = catalog.tracks;

const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const sessions = new Map();
let defaultSession;
async function call(action, token, body, expected = 200, session = sessions.get(token) ?? defaultSession) {
  const response = await fetch(`${base}/api/nearby/${action}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...accountHeaders(session), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${action} status`);
  return response.json();
}
async function start(trackId = firstTrack.id) {
  const { session } = await mockAccount(base);
  defaultSession ??= session;
  const result = await call("start", null, { trackId }, 201, session);
  sessions.set(result.token, session); return { ...result, session };
}
async function stop(person) { await call("stop", person.token, {}); }
function connect(ticket, accountToken) {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/rooms/${ticket.roomId}/socket`);
  const events = [];
  socket.addEventListener("message", event => events.push(JSON.parse(event.data)));
  socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "hello", token: ticket.token, clientId: crypto.randomUUID(), accountToken })));
  const wait = async predicate => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const event = events.find(predicate);
      if (event) return event;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error("Room message timed out");
  };
  return { socket, wait };
}

test("inviter waits alone, host accepts explicitly, and cancelled invitations cannot be accepted", async () => {
  const a = await start(), b = await start(secondTrack.id);
  let guest, host;
  try {
    const followed = await call("follow", a.token, { targetId: b.self.id });
    guest = connect(followed.ticket, a.session.token);
    const waiting = await guest.wait(event => event.type === "welcome");
    assert.equal(waiting.room.hostConnected, false); assert.equal(waiting.room.guestConnected, true);
    assert.equal(waiting.room.playback.playing, false);
    const invitation = await call("state", b.token);
    await call("accept", a.token, { roomId: followed.ticket.roomId }, 409);
    await call("accept", b.token, { roomId: crypto.randomUUID() }, 409);
    const accepted = await call("accept", b.token, { roomId: invitation.ticket.roomId });
    host = connect(accepted.ticket, b.session.token);
    await guest.wait(event => event.room?.hostConnected && event.room.guestConnected);
    guest.socket.send(JSON.stringify({ type: "leave" }));
    await host.wait(event => event.room?.closed);
    assert.equal((await call("state", b.token)).ticket, null);
    await call("accept", b.token, { roomId: followed.ticket.roomId }, 409);
  } finally {
    guest?.socket.close(); host?.socket.close();
    await Promise.all([stop(a), stop(b)]);
  }
});

test("cancelling before the host joins removes the invitation", async () => {
  const a = await start(), b = await start();
  let guest;
  try {
    const followed = await call("follow", a.token, { targetId: b.self.id });
    guest = connect(followed.ticket, a.session.token);
    await guest.wait(event => event.type === "welcome");
    assert.ok((await call("state", b.token)).ticket);
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cancelled room did not close")), 8000);
      guest.socket.addEventListener("close", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    guest.socket.send(JSON.stringify({ type: "leave" }));
    await closed;
    assert.equal((await call("state", b.token)).ticket, null);
    await call("accept", b.token, { roomId: followed.ticket.roomId }, 409);
  } finally { guest?.socket.close(); await Promise.all([stop(a), stop(b)]); }
});

test("opt-in discovery, one-tap follow, one room per listener and private two-person playback", async () => {
  const people = await Promise.all([start(), start(secondTrack.id), start(thirdTrack.id)]);
  const [a, b, c] = people;
  let host, guest;
  try {
    const state = await call("state", a.token);
    assert.ok(state.peers.some(peer => peer.id === b.self.id));
    assert.ok(state.peers.every(peer => Object.keys(peer).sort().join() === "alias,id,trackId"));
    assert.equal("invite" in state, false);
    assert.equal((await call("state", crypto.randomUUID(), undefined, 401)).error, "SESSION_EXPIRED");
    const invalidSession = (await mockAccount(base)).session;
    await call("start", null, { trackId: "foreign" }, 400, invalidSession);
    await call("follow", a.token, { targetId: "__proto__" }, 409);
    await call("follow", a.token, { targetId: a.self.id }, 409);
    // a 和 c 同时跟 b：只有一个能进房间。
    const racing = await Promise.all([a, c].map(person => fetch(`${base}/api/nearby/follow`, { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(person.session), Authorization: `Bearer ${person.token}` }, body: JSON.stringify({ targetId: b.self.id }) })));
    assert.deepEqual(racing.map(response => response.status).sort(), [200, 409]);
    const [follower, outsider] = racing[0].status === 200 ? [a, c] : [c, a];
    assert.equal((await racing.find(response => response.status === 409).json()).error, "BUSY");
    const hostState = await call("state", b.token), guestState = await call("state", follower.token);
    assert.equal(hostState.ticket.role, "host"); assert.equal(hostState.ticket.peerAlias, follower.self.alias);
    assert.equal(guestState.ticket.role, "guest"); assert.equal(guestState.ticket.peerAlias, b.self.alias);
    assert.equal(hostState.ticket.roomId, guestState.ticket.roomId);
    assert.notEqual(hostState.ticket.token, guestState.ticket.token);
    const other = await call("state", outsider.token);
    assert.equal(other.ticket, null);
    assert.ok(!other.peers.some(peer => [follower.self.id, b.self.id].includes(peer.id)));
    host = connect(hostState.ticket, b.session.token); guest = connect(guestState.ticket, follower.session.token);
    const welcome = await host.wait(event => event.type === "welcome");
    assert.equal(welcome.role, "host"); assert.equal(welcome.invitationToken, undefined);
    assert.equal((await guest.wait(event => event.type === "welcome")).role, "guest");
    const joined = await host.wait(event => event.type === "state" && event.room.guestConnected && event.room.hostConnected);
    host.socket.send(JSON.stringify({ type: "command", id: crypto.randomUUID(), revision: joined.room.revision, action: "play" }));
    const playing = await guest.wait(event => event.room?.playback.playing);
    assert.equal(playing.room.playback.trackId, secondTrack.id, "the room plays what the followed listener was playing");
    guest.socket.send(JSON.stringify({ type: "leave" }));
    await host.wait(event => event.room?.closed);
    assert.equal((await fetch(`${base}/api/rooms/${hostState.ticket.roomId}/status`)).status, 404);
  } finally {
    host?.socket.close(); guest?.socket.close();
    await Promise.all(people.map(stop));
  }
});

test("follow cooldown survives a presence restart; stopped or busy listeners cannot be followed", async () => {
  const people = await Promise.all([start(), start(), start()]);
  const [a, b, c] = people;
  try {
    await call("follow", a.token, { targetId: b.self.id });
    assert.equal((await call("follow", c.token, { targetId: b.self.id }, 409)).error, "BUSY");
    assert.equal((await call("follow", c.token, { targetId: a.self.id }, 409)).error, "BUSY");
    await stop(a);
    const again = await call("start", null, { trackId: firstTrack.id }, 201, a.session);
    sessions.set(again.token, a.session); people[0] = { ...again, session: a.session };
    assert.equal((await call("follow", again.token, { targetId: c.self.id }, 429)).error, "COOLDOWN");
    await stop(b); people.splice(people.indexOf(b), 1);
    assert.equal((await call("follow", c.token, { targetId: b.self.id }, 409)).error, "UNAVAILABLE");
  } finally { await Promise.all(people.map(stop)); }
});

for (const closeImmediately of [false, true]) test(`host logout invalidates room with ${closeImmediately ? "immediate socket close" : "heartbeat"}`, async () => {
  const a = await start(), b = await start(secondTrack.id);
  let host, guest;
  try {
    const followed = await call("follow", a.token, { targetId: b.self.id });
    const hosting = await call("state", b.token);
    host = connect(hosting.ticket, b.session.token); guest = connect(followed.ticket, a.session.token);
    await host.wait(event => event.type === "welcome"); await guest.wait(event => event.type === "welcome");
    const revoked = await fetch(`${base}/api/host/logout`, { method: "POST", headers: { ...accountHeaders(b.session), "Content-Type": "application/json" }, body: "{}" });
    assert.equal(revoked.status, 200);
    host.socket.send(JSON.stringify(closeImmediately ? { type: "leave" } : { type: "ping", sentAt: Date.now() }));
    if (closeImmediately) host.socket.close();
    await guest.wait(event => event.room?.closed);
    assert.equal((await fetch(`${base}/api/rooms/${hosting.ticket.roomId}/status`)).status, 404);
  } finally {
    host?.socket.close(); guest?.socket.close();
    await stop(a);
  }
});

test("origin and body validation reject invalid requests; loss of presence expires identity", { timeout: 60000 }, async () => {
  const offline = await start();
  const foreign = await fetch(`${base}/api/nearby/start`, { method: "POST", headers: { Origin: "https://unrelated.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ trackId: firstTrack.id }) });
  assert.equal(foreign.status, 403);
  const large = await fetch(`${base}/api/nearby/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: firstTrack.id, extra: "x".repeat(1024) }) });
  assert.equal(large.status, 413);
  await new Promise(resolve => setTimeout(resolve, 36_000));
  await call("state", offline.token, undefined, 401);
});
