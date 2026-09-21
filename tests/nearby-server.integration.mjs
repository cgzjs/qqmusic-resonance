import test from "node:test";
import assert from "node:assert/strict";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";

const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
const sessions = new Map();
let defaultSession;
async function call(action, token, body, expected = 200, session = sessions.get(token) ?? defaultSession) {
  const response = await fetch(`${base}/api/nearby/${action}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...accountHeaders(session), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${action} status`);
  return response.json();
}
async function start(trackId = "demo-night") {
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

test("opt-in, authenticated consent, concurrent acceptance and private two-person playback", async () => {
  const people = await Promise.all([start(), start("demo-glass"), start("demo-breeze")]);
  const [a, b, c] = people;
  let host, guest;
  try {
    const state = await call("state", a.token);
    assert.ok(state.peers.some(peer => peer.id === b.self.id));
    assert.ok(state.peers.every(peer => Object.keys(peer).sort().join() === "alias,id,trackId"));
    assert.equal((await call("state", crypto.randomUUID(), undefined, 401)).error, "SESSION_EXPIRED");
    const invalidSession = (await mockAccount(base)).session;
    await call("start", null, { trackId: "foreign" }, 400, invalidSession);
    await call("invite", a.token, { targetId: "__proto__" }, 409);
    const offered = await call("invite", a.token, { targetId: b.self.id });
    assert.equal(offered.ticket, null);
    assert.equal(offered.invite.trackId, "demo-glass");
    await call("invite", a.token, { targetId: c.self.id }, 409);
    await call("respond", c.token, { inviteId: offered.invite.id, decision: "accept" }, 403);
    await call("respond", a.token, { inviteId: offered.invite.id, decision: "accept" }, 403);
    const responses = await Promise.all([0, 1].map(() => fetch(`${base}/api/nearby/respond`, { method: "POST", headers: { "Content-Type": "application/json", ...accountHeaders(b.session), Authorization: `Bearer ${b.token}` }, body: JSON.stringify({ inviteId: offered.invite.id, decision: "accept" }) })));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const hostState = await call("state", b.token), guestState = await call("state", a.token);
    assert.equal(hostState.ticket.roomId, guestState.ticket.roomId);
    assert.notEqual(hostState.ticket.token, guestState.ticket.token);
    const outsider = await call("state", c.token);
    assert.equal(outsider.ticket, null);
    assert.ok(!outsider.peers.some(peer => [a.self.id, b.self.id].includes(peer.id)));
    host = connect(hostState.ticket, b.session.token); guest = connect(guestState.ticket, a.session.token);
    const welcome = await host.wait(event => event.type === "welcome");
    assert.equal(welcome.role, "host"); assert.equal(welcome.invitationToken, undefined);
    assert.equal((await guest.wait(event => event.type === "welcome")).role, "guest");
    const joined = await host.wait(event => event.type === "state" && event.room.guestConnected && event.room.hostConnected);
    host.socket.send(JSON.stringify({ type: "command", id: crypto.randomUUID(), revision: joined.room.revision, action: "play" }));
    const playing = await guest.wait(event => event.room?.playback.playing);
    assert.equal(playing.room.playback.trackId, "demo-glass");
    guest.socket.send(JSON.stringify({ type: "leave" }));
    await host.wait(event => event.room?.closed);
    assert.equal((await fetch(`${base}/api/rooms/${hostState.ticket.roomId}/status`)).status, 404);
  } finally {
    host?.socket.close(); guest?.socket.close();
    await Promise.all(people.map(stop));
  }
});

test("decline, pair cooldown, cancel and stopping discovery invalidate invitations", async () => {
  const people = await Promise.all([start(), start(), start()]);
  const [a, b, c] = people;
  try {
    const first = await call("invite", a.token, { targetId: b.self.id });
    await call("respond", b.token, { inviteId: first.invite.id, decision: "decline" });
    assert.equal((await call("state", a.token)).invite.status, "declined");
    assert.equal((await call("invite", b.token, { targetId: a.self.id }, 429)).error, "COOLDOWN");
    const second = await call("invite", c.token, { targetId: b.self.id });
    await call("respond", b.token, { inviteId: second.invite.id, decision: "cancel" }, 403);
    await call("respond", c.token, { inviteId: second.invite.id, decision: "cancel" });
    await call("respond", b.token, { inviteId: second.invite.id, decision: "accept" }, 409);
    const third = await call("invite", b.token, { targetId: a.self.id }, 429);
    assert.equal(third.error, "COOLDOWN");
    await stop(b); people.splice(people.indexOf(b), 1);
    assert.ok(!(await call("state", a.token)).peers.some(peer => peer.id === b.self.id));
    await call("invite", c.token, { targetId: b.self.id }, 409);
  } finally { await Promise.all(people.map(stop)); }
});

for (const closeImmediately of [false, true]) test(`host logout invalidates room with ${closeImmediately ? "immediate socket close" : "heartbeat"}`, async () => {
  const a = await start(), b = await start("demo-glass");
  let host, guest;
  try {
    const offered = await call("invite", a.token, { targetId: b.self.id });
    const accepted = await call("respond", b.token, { inviteId: offered.invite.id, decision: "accept" });
    const followed = await call("state", a.token);
    host = connect(accepted.ticket, b.session.token); guest = connect(followed.ticket, a.session.token);
    await host.wait(event => event.type === "welcome"); await guest.wait(event => event.type === "welcome");
    const revoked = await fetch(`${base}/api/host/logout`, { method: "POST", headers: { ...accountHeaders(b.session), "Content-Type": "application/json" }, body: "{}" });
    assert.equal(revoked.status, 200);
    host.socket.send(JSON.stringify(closeImmediately ? { type: "leave" } : { type: "ping", sentAt: Date.now() }));
    if (closeImmediately) host.socket.close();
    await guest.wait(event => event.room?.closed);
    assert.equal((await fetch(`${base}/api/rooms/${accepted.ticket.roomId}/status`)).status, 404);
  } finally {
    host?.socket.close(); guest?.socket.close();
    await stop(a);
  }
});

test("pause cancels pending consent, and origin/body validation rejects invalid requests", async () => {
  const a = await start(), b = await start();
  try {
    const invite = await call("invite", a.token, { targetId: b.self.id });
    await stop(a);
    assert.equal((await call("state", b.token)).invite.status, "cancelled");
    await call("respond", b.token, { inviteId: invite.invite.id, decision: "accept" }, 409);
    const foreign = await fetch(`${base}/api/nearby/start`, { method: "POST", headers: { Origin: "https://unrelated.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "demo-night" }) });
    assert.equal(foreign.status, 403);
    const large = await fetch(`${base}/api/nearby/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "demo-night", extra: "x".repeat(1024) }) });
    assert.equal(large.status, 413);
  } finally { await stop(b); }
});

test("45-second timeout cannot be accepted; loss of presence expires identity", { timeout: 60000 }, async () => {
  const a = await start(), b = await start(), offline = await start();
  const offered = await call("invite", a.token, { targetId: b.self.id });
  try {
    while (Date.now() <= offered.invite.expiresAt + 100) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await Promise.all([call("state", a.token), call("state", b.token)]);
    }
    assert.equal((await call("state", b.token)).invite.status, "expired");
    await call("respond", b.token, { inviteId: offered.invite.id, decision: "accept" }, 409);
    await call("state", offline.token, undefined, 401);
  } finally { await Promise.all([stop(a), stop(b)]); }
});
