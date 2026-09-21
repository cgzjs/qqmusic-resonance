import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.ROOM_TEST_URL || "http://localhost:5173";
class Peer {
  constructor(roomId, token, clientId = randomUUID()) {
    this.messages = []; this.waiters = []; this.latest = null; this.closed = null;
    const url = new URL(`/api/rooms/${roomId}/socket`, base); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => this.send({ type: "hello", token, clientId }));
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.room && (!this.latest || message.room.revision >= this.latest.revision)) this.latest = message.room;
      this.deliver(message);
    });
    this.socket.addEventListener("close", event => { this.closed = { type: "close", code: event.code, reason: event.reason }; this.deliver(this.closed); });
    this.socket.addEventListener("error", () => {});
  }
  deliver(message) {
    const waiter = this.waiters.find(item => item.predicate(message));
    if (waiter) { this.waiters.splice(this.waiters.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else this.messages.push(message);
  }
  wait(predicate) {
    const index = this.messages.findIndex(predicate);
    if (index !== -1) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const item = { predicate, resolve, timer: setTimeout(() => { this.waiters.splice(this.waiters.indexOf(item), 1); reject(new Error(`Timed out waiting for room event (socket=${this.socket.readyState}; events=${JSON.stringify(this.messages.map(({ type, error, code, reason }) => ({ type, error, code, reason })))} )`)); }, 8000) };
      this.waiters.push(item);
    });
  }
  send(value) { this.socket.send(JSON.stringify(value)); }
  command(action, extra = {}) { const value = { type: "command", id: randomUUID(), revision: this.latest.revision, action, ...extra }; this.send(value); return value; }
  close() { this.socket.close(); }
}
const stateAfter = (version, check = () => true) => message => message.room?.revision > version && check(message.room);

test("real room server: roles, shared transport, reconnect, capacity and ending", { timeout: 35000 }, async () => {
  const invalidOrigin = await fetch(`${base}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://other.invalid" }, body: JSON.stringify({ trackId: "demo-night" }) });
  assert.equal(invalidOrigin.status, 403);
  const invalidTrack = await fetch(`${base}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackId: "invalid" }) });
  assert.equal(invalidTrack.status, 400);
  const response = await fetch(`${base}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ trackId: "demo-night" }) });
  assert.equal(response.status, 201, "Start npm run dev before running server integration tests");
  const created = await response.json();
  const peers = [];
  const hostId = randomUUID();
  let host = new Peer(created.roomId, created.hostToken, hostId); peers.push(host);
  try {
    const welcome = await host.wait(message => message.type === "welcome");
    assert.equal(welcome.role, "host");
    const bad = new Peer(created.roomId, randomUUID()); peers.push(bad);
    assert.equal((await bad.wait(message => message.type === "close")).code, 4001);
    const guestId = randomUUID();
    let guest = new Peer(created.roomId, welcome.invitationToken, guestId); peers.push(guest);
    const guestWelcome = await guest.wait(message => message.type === "welcome");
    assert.equal(guestWelcome.role, "guest"); assert.equal(guestWelcome.invitationToken, undefined);
    await host.wait(message => message.room?.guestConnected);
    const third = new Peer(created.roomId, welcome.invitationToken); peers.push(third);
    assert.equal((await third.wait(message => message.type === "close")).code, 4003);

    guest.command("play");
    assert.equal((await guest.wait(message => message.type === "error")).error, "HOST_ONLY");
    let version = host.latest.revision;
    const play = host.command("play");
    await Promise.all([host.wait(stateAfter(version, room => room.playback.playing)), guest.wait(stateAfter(version, room => room.playback.playing))]);
    version = host.latest.revision;
    host.send(play);
    const duplicate = await host.wait(message => message.type === "state" && message.room?.revision === version);
    assert.equal(duplicate.room.revision, version);
    host.command("seek", { position: 12 });
    const seeks = await Promise.all([host.wait(stateAfter(version, room => room.playback.position === 12)), guest.wait(stateAfter(version, room => room.playback.position === 12))]);
    assert.deepEqual(seeks[0].room.playback, seeks[1].room.playback);
    version = host.latest.revision;
    host.command("pause");
    await Promise.all([host.wait(stateAfter(version, room => !room.playback.playing)), guest.wait(stateAfter(version, room => !room.playback.playing))]);
    version = host.latest.revision;
    host.command("track", { trackId: "demo-glass" });
    await Promise.all([host.wait(stateAfter(version, room => room.playback.trackId === "demo-glass")), guest.wait(stateAfter(version, room => room.playback.trackId === "demo-glass"))]);
    host.send({ ...play, id: randomUUID() });
    assert.equal((await host.wait(message => message.type === "error")).error, "STALE_REVISION");

    version = host.latest.revision;
    host.command("seek", { position: 23.8 });
    await host.wait(stateAfter(version));
    version = host.latest.revision;
    host.command("play");
    await host.wait(stateAfter(version));
    await new Promise(resolve => setTimeout(resolve, 350));
    host.send({ type: "ping", sentAt: Date.now() });
    const endedAudio = await host.wait(message => message.type === "state" && message.room?.playback.position === 24 && !message.room.playback.playing);
    assert.equal(endedAudio.room.playback.position, 24);

    version = host.latest.revision;
    guest.close();
    await host.wait(stateAfter(version, room => !room.guestConnected && !room.playback.playing));
    const reservedSeat = new Peer(created.roomId, welcome.invitationToken); peers.push(reservedSeat);
    assert.equal((await reservedSeat.wait(message => message.type === "close")).code, 4003);
    guest = new Peer(created.roomId, welcome.invitationToken, guestId); peers.push(guest);
    await guest.wait(message => message.type === "welcome");
    await host.wait(message => message.room?.guestConnected && message.room.revision > version);
    assert.equal(guest.latest.playback.trackId, "demo-glass");
    version = host.latest.revision;
    guest.send({ type: "leave" });
    await host.wait(stateAfter(version, room => !room.guestConnected));
    const replacement = new Peer(created.roomId, welcome.invitationToken); peers.push(replacement);
    await replacement.wait(message => message.type === "welcome");
    assert.equal(replacement.latest.guestConnected, true);
    version = replacement.latest.revision;
    host.close();
    await replacement.wait(stateAfter(version, room => !room.hostConnected && !room.playback.playing));
    host = new Peer(created.roomId, created.hostToken, hostId); peers.push(host);
    await host.wait(message => message.type === "welcome");
    assert.equal(host.latest.playback.trackId, "demo-glass");
    host.send({ type: "leave" });
    await replacement.wait(message => message.type === "close" && message.code === 4004);
    const ended = await fetch(`${base}/api/rooms/${created.roomId}/status`);
    assert.equal(ended.status, 404);
  } finally {
    if (host.socket.readyState === 1) host.send({ type: "leave" });
    peers.forEach(peer => peer.close());
  }
});
