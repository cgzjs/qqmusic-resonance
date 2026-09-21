import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.ROOM_TEST_URL ?? "http://localhost:5173";
class Peer {
  events = [];
  constructor(roomId, token, clientId = crypto.randomUUID()) {
    this.socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/rooms/${roomId}/socket`);
    this.socket.addEventListener("message", event => this.events.push(JSON.parse(event.data)));
    this.socket.addEventListener("close", event => this.events.push({ type: "close", code: event.code }));
    this.socket.addEventListener("open", () => { if (token) this.send({ type: "hello", token, clientId }); });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  async wait(predicate) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const found = this.events.find(predicate);
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Expected reaction event did not arrive");
  }
  reaction(kind, values = {}) {
    const message = { type: "reaction", id: crypto.randomUUID(), kind, trackId: "demo-night", sentAt: Date.now(), ...values };
    this.send(message); return message;
  }
}

test("two-way reactions require receipt, deduplicate, throttle and never change playback", async () => {
  const created = await (await fetch(`${base}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "demo-night" }) })).json();
  const host = new Peer(created.roomId, created.hostToken);
  const peers = [host];
  try {
    const welcome = await host.wait(event => event.type === "welcome");
    const offline = host.reaction("wave");
    assert.equal((await host.wait(event => event.id === offline.id)).error, "PEER_OFFLINE");
    const guestId = crypto.randomUUID();
    const guest = new Peer(created.roomId, welcome.invitationToken, guestId); peers.push(guest);
    const joined = await guest.wait(event => event.type === "welcome");
    const reaction = host.reaction("wave");
    const received = await guest.wait(event => event.type === "reaction" && event.event.id === reaction.id);
    assert.equal(received.event.from, "host");
    assert.equal((await host.wait(event => event.id === reaction.id)).status, "sent");
    host.send({ type: "reaction-received", id: reaction.id });
    host.send({ type: "ping", sentAt: 101 });
    await host.wait(event => event.sentAt === 101);
    assert.ok(!host.events.some(event => event.id === reaction.id && event.status === "received"));
    guest.send({ type: "reaction-received", id: reaction.id });
    await host.wait(event => event.id === reaction.id && event.status === "received");
    host.send(reaction);
    host.send({ type: "ping", sentAt: 102 });
    const unchanged = await host.wait(event => event.sentAt === 102);
    assert.equal(guest.events.filter(event => event.type === "reaction" && event.event.id === reaction.id).length, 1);
    assert.deepEqual(unchanged.room.playback, joined.room.playback);
    assert.equal(unchanged.room.revision, joined.room.revision);
    const spam = host.reaction("heart");
    assert.equal((await host.wait(event => event.id === spam.id)).error, "RATE_LIMIT");
    const expired = guest.reaction("heart", { sentAt: Date.now() - 7000 });
    assert.equal((await guest.wait(event => event.id === expired.id)).error, "REACTION_EXPIRED");
    const changed = guest.reaction("heart", { trackId: "demo-glass" });
    assert.equal((await guest.wait(event => event.id === changed.id)).error, "TRACK_CHANGED");
    const back = guest.reaction("heart", { from: "host" });
    assert.equal((await host.wait(event => event.type === "reaction" && event.event.id === back.id)).event.from, "guest");
    host.send({ type: "reaction-received", id: back.id });
    await guest.wait(event => event.id === back.id && event.status === "received");
    guest.socket.close();
    await host.wait(event => event.type === "state" && !event.room.guestConnected && event.room.revision > unchanged.room.revision);
    const returned = new Peer(created.roomId, welcome.invitationToken, guestId); peers.push(returned);
    const refreshed = await returned.wait(event => event.type === "welcome");
    assert.equal(refreshed.room.reactions, undefined);
    returned.send({ type: "ping", sentAt: 103 }); await returned.wait(event => event.sentAt === 103);
    assert.equal(returned.events.filter(event => event.type === "reaction").length, 0);
    const outsider = new Peer(created.roomId, null); peers.push(outsider);
    await new Promise(resolve => outsider.socket.addEventListener("open", resolve, { once: true }));
    outsider.reaction("wave");
    assert.equal((await outsider.wait(event => event.type === "close")).code, 4001);
  } finally { host.send({ type: "leave" }); for (const peer of peers) peer.socket.close(); }
});

test("a delayed receiver acknowledgment cannot claim a stale reaction was delivered", async () => {
  const created = await (await fetch(`${base}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "demo-night" }) })).json();
  const host = new Peer(created.roomId, created.hostToken);
  let guest;
  try {
    const welcome = await host.wait(event => event.type === "welcome");
    guest = new Peer(created.roomId, welcome.invitationToken);
    await guest.wait(event => event.type === "welcome");
    const sent = host.reaction("heart");
    await guest.wait(event => event.type === "reaction");
    await new Promise(resolve => setTimeout(resolve, 6100));
    guest.send({ type: "reaction-received", id: sent.id });
    host.send(sent);
    assert.equal((await host.wait(event => event.id === sent.id && event.status === "failed")).error, "DELIVERY_UNCONFIRMED");
    assert.ok(!host.events.some(event => event.id === sent.id && event.status === "received"));
  } finally { host.send({ type: "leave" }); host.socket.close(); guest?.socket.close(); }
});
