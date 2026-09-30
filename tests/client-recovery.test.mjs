import test, { after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// Exercise the real hooks and audio coordinator. Only browser transport and host/router
// boundaries are faked; no production debug endpoints or browser automation are needed.
const folder = path.resolve("node_modules/.cache/client-recovery");
await mkdir(folder, { recursive: true });
const bundle = path.join(folder, `client-recovery-${process.pid}.mjs`);
const result = await build({
  stdin: { contents: `export { HostStatus } from './components/resonance/HostStatus'; export { ListeningArtwork } from './components/resonance/ListeningArtwork'; export { BlockListenerButton } from './components/resonance/ListenerSafety'; export { useListenerSafety } from './hooks/useListenerSafety'; export { CurrentPlaybackBar } from './components/resonance/CurrentPlaybackBar'; export { useFollowerNotification, useRoomExchangeNotification } from './hooks/useOnlineNotifications'; export { JourneySummary } from './components/resonance/JourneySummary'; export { ReceivedSongs } from './components/resonance/ReceivedSongs'; export { ResonanceExperience } from './components/resonance/ResonanceExperience'; export { useDemoReplies } from './hooks/useDemoReplies'; export { ReactionDock } from './components/resonance/ReactionDock'; export { useNearby } from './hooks/useNearby'; export { RoomSession } from './components/resonance/RoomSession'; export { useListeningRoom } from './hooks/useListeningRoom'; export { useRoomAudio } from './hooks/useRoomAudio'; export { OnlineNearbyPanel } from './components/resonance/OnlineNearbyPanel'; export { audioTracks } from './lib/resonance/demo-data';`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "node", format: "esm", packages: "external", write: false,
  plugins: [{ name: "test-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(sonner|@\/components\/ui\/sonner)$/ }, args => ({ path: args.path, namespace: "toast" }));
    builder.onLoad({ filter: /.*/, namespace: "toast" }, args => ({ contents: args.path === "sonner" ? "export const toast = Object.assign((title, options) => { globalThis.recoveryTest.toasts.push({title, ...options}); return options.id; }, { dismiss(id) { globalThis.recoveryTest.dismissedToasts?.push(id); } });" : "export const Toaster = () => null;" }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "image" }));
    builder.onLoad({ filter: /.*/, namespace: "image" }, () => ({ resolveDir: process.cwd(), contents: "import React from 'react'; export default function Image({fill, unoptimized, priority, ...props}) { return React.createElement('img', props); }" }));
    builder.onResolve({ filter: /^(next\/navigation|\.\/HostProvider|@\/components\/resonance\/HostProvider|@\/lib\/resonance\/demo-host)$/ }, args => ({ path: args.path, namespace: "boundary" }));
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: args.path.includes("navigation") ? "export const useRouter = () => globalThis.recoveryTest.router;" : args.path.includes("HostProvider") ? "export const useHost = () => globalThis.recoveryTest.host ?? ({session: globalThis.recoveryTest.session});" : "export const hostFetch = async () => { throw new Error('Unexpected host request in this test'); }; export const demoHost = {switchAccount: async slot => { (globalThis.recoveryTest.logins ??= []).push(slot); return globalThis.recoveryTest.loginResult ?? {status: 'ready'}; }, setTrack: id => { globalThis.recoveryTest.host.trackId = id; }, expire: () => globalThis.recoveryTest.expired++};" }));
  } }],
});
await writeFile(bundle, result.outputFiles[0].text);
const { HostStatus, ListeningArtwork, BlockListenerButton, useListenerSafety, CurrentPlaybackBar, useFollowerNotification, useRoomExchangeNotification, JourneySummary, ReceivedSongs, ResonanceExperience, useDemoReplies, ReactionDock, useNearby, useListeningRoom, useRoomAudio, OnlineNearbyPanel, RoomSession, audioTracks } = await import(pathToFileURL(bundle));
after(() => unlink(bundle));
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let dom, root, current, online, calls, respond, player;
const sockets = [];
class Socket {
  static OPEN = 1;
  readyState = 0;
  sent = [];
  constructor() { sockets.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(raw) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(raw)); }
  message(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
  close(code = 1000, reason = "") { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code, reason }); }
}
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const room = (extra = {}) => ({ id, revision: 1, expiresAt: Date.now() + 100000, closed: false, hostConnected: true, guestConnected: true, playback: { trackId: audioTracks[0].id, position: 2, playing: true, updatedAt: Date.now() }, ...extra });
const nearby = (extra = {}) => ({ self: { id, alias: "听众 A", trackId: audioTracks[0].id }, peers: [], ticket: null, serverTime: Date.now(), ...extra });
const peerB = () => ({ id: token, alias: "听众 B", trackId: audioTracks[1].id });
const flush = () => act(async () => {});
beforeEach(() => {
  dom = new JSDOM('<div id="app"></div>', { url: `http://localhost/room/${id}`, pretendToBeVisual: true });
  for (const key of ["window", "document", "navigator", "sessionStorage", "HTMLElement", "HTMLFormElement", "HTMLInputElement", "HTMLSelectElement", "Element", "Node", "MutationObserver", "CustomEvent", "Event"]) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.WebSocket = Socket;
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 16);
  globalThis.cancelAnimationFrame = clearTimeout;
  online = true; sockets.length = 0; calls = [];
  Object.defineProperty(navigator, "onLine", { get: () => online });
  globalThis.recoveryTest = { session: { accountId: "account-a", token, displayName: "A", mode: "demo", expiresAt: Date.now() + 100000 }, router: { push: value => calls.push({ route: value }) }, expired: 0, toasts: [], dismissedToasts: [] };
  sessionStorage.setItem(`resonance.nearby-room.account-a.${id}`, token);
  respond = async url => response(url.includes("start") ? { ...nearby(), token } : nearby());
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  player = { track: audioTracks[0], status: "paused", duration: 24, readPosition: () => 2, seek: value => calls.push({ seek: value }), changePlaybackRate() {}, pause() { this.status = "paused"; calls.push({ pause: true }); }, playTrack: async () => { player.status = "playing"; calls.push({ play: true }); return true; }, prepareTrack() {} };
  root = createRoot(document.getElementById("app"));
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });
async function mount(kind = "room") {
  function RoomHarness() {
    current = useListeningRoom(id);
    useRoomAudio(current.room, current.connection, current.offset, player, current.isSynchronized);
    return null;
  }
  function NearbyHarness() {
    current = useNearby(recoveryTest.session);
    return React.createElement(OnlineNearbyPanel, { nearby: current, currentTrackId: audioTracks[0].id });
  }
  await act(async () => root.render(React.createElement(kind === "room" ? RoomHarness : NearbyHarness)));
  if (kind === "room") await act(async () => current.join());
}
async function welcome(socket = sockets.at(-1)) {
  await act(async () => { socket.open(); socket.message({ type: "welcome", role: "host", room: room(), serverTime: Date.now() }); });
  return socket;
}
async function network(value) {
  await act(async () => { online = value; window.dispatchEvent(new window.Event(value ? "online" : "offline")); });
}

test("foreground resume pauses synchronously; old queued state cannot release audio or commands", async () => {
  await mount(); const socket = await welcome();
  assert.equal(player.status, "playing");
  await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
  assert.equal(player.status, "paused");
  assert.equal(current.connection, "reconnecting");
  const count = socket.sent.length;
  await act(async () => { current.command("play"); current.sendReaction("heart"); current.sendExchange(audioTracks[0].id); });
  assert.equal(socket.sent.length, count);
  await act(async () => socket.message({ type: "state", room: room(), serverTime: Date.now() }));
  assert.equal(player.status, "paused");
  const ping = socket.sent.at(-1);
  await act(async () => socket.message({ type: "state", room: room(), serverTime: Date.now(), sentAt: ping.sentAt }));
  assert.equal(current.connection, "connected"); assert.equal(player.status, "playing");
});

test("offline pauses audio, exchange is not replayed; explicit retry retains its request id", async () => {
  await mount(); const first = await welcome();
  await act(async () => current.sendExchange(audioTracks[0].id));
  const command = first.sent.at(-1);
  await network(false);
  assert.equal(player.status, "paused"); assert.equal(current.exchangeRequest, "uncertain");
  await network(true); const second = await welcome();
  assert.notEqual(second, first); assert.equal(second.sent.some(item => item.type === "exchange"), false);
  await act(async () => current.retryExchange());
  assert.deepEqual(second.sent.at(-1), command);
  await act(async () => second.message({ type: "exchange-result", requestId: command.id, room: room(), serverTime: Date.now() }));
  assert.equal(current.exchangeRequest, "idle");
  await act(async () => current.leave());
  await network(false); await network(true);
  assert.equal(sockets.length, 2); assert.equal(current.connection, "closed");
});

test("TCP open without welcome times out and starts exactly one retry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  await mount(); await act(async () => sockets[0].open());
  await act(async () => t.mock.timers.tick(8000));
  assert.equal(current.connection, "reconnecting"); assert.equal(current.isSynchronized(), false);
  await act(async () => t.mock.timers.tick(750));
  assert.equal(sockets.length, 2);
});

test("long browser suspension rejects the old socket and resynchronizes paused playback", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
  await mount(); const old = await welcome();
  // Advancing the clock without running timers models a suspended page.
  t.mock.timers.setTime(1_040_000);
  await act(async () => document.dispatchEvent(new window.Event("visibilitychange")));
  assert.equal(player.status, "paused"); assert.equal(current.isSynchronized(), false);
  await act(async () => old.message({ type: "state", room: room({ revision: 999 }), serverTime: Date.now() }));
  assert.equal(current.room.revision, 1);
  const replacement = sockets.at(-1);
  await act(async () => {
    replacement.open();
    replacement.message({ type: "welcome", role: "host", room: room({ revision: 2, playback: { trackId: audioTracks[0].id, position: 9, playing: false, updatedAt: Date.now() } }), serverTime: Date.now() });
  });
  assert.equal(current.connection, "connected"); assert.equal(player.status, "paused");
  assert.equal(calls.some(item => item.seek === 9), true);
});

test("expired room clears unresolved exchange and does not resurrect on pageshow", async () => {
  await mount(); await welcome();
  await act(async () => current.sendExchange(audioTracks[0].id));
  await network(false); respond = async () => response({}, 404);
  await network(true);
  assert.equal(current.connection, "closed"); assert.equal(current.exchangeRequest, "idle");
  const count = calls.length;
  await act(async () => window.dispatchEvent(new window.Event("pageshow")));
  assert.equal(calls.length, count);
});

test("follow is disabled offline, never sent while offline, and does not auto-start expired presence", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  respond = async () => response({ ...nearby({ peers: [peerB()] }), token });
  await mount("nearby"); await act(async () => current.request("start", { trackId: audioTracks[0].id }));
  const follow = () => [...document.querySelectorAll("button")].find(button => button.textContent.includes("跟 TA 一起听"));
  assert.equal(follow().disabled, false);
  await network(false); assert.equal(follow().disabled, true);
  await act(async () => t.mock.timers.tick(9000));
  const count = calls.length;
  await act(async () => current.request("follow", { targetId: token }));
  assert.equal(calls.length, count);
  respond = async () => response({ error: "SESSION_EXPIRED" }, 401);
  await network(true);
  assert.equal(current.snapshot, null); assert.match(current.error, /已自动隐身/);
  assert.equal(calls.filter(item => item.url?.endsWith("start")).length, 1);
});

test("tapping follow enters the inviter's room immediately", async () => {
  respond = async () => response({ ...nearby({ peers: [peerB()] }), token });
  await mount("nearby"); await act(async () => current.request("start", { trackId: audioTracks[0].id }));
  assert.equal(document.body.textContent.includes("邀请"), false);
  const ticket = { roomId: id, token, role: "guest", peerAlias: "听众 B" };
  respond = async url => response(url.includes("stop") ? {} : nearby({ ticket }));
  const follow = [...document.querySelectorAll("button")].find(button => button.textContent.includes("跟 TA 一起听"));
  await act(async () => follow.click()); await flush();
  const sent = calls.find(item => item.url?.endsWith("/follow"));
  assert.deepEqual(JSON.parse(sent.options.body), { targetId: token });
  assert.equal(current.room, id); assert.deepEqual(current.joined, ticket);
  assert.equal(calls.filter(item => item.url?.endsWith("stop")).length, 1);
});

test("a host ticket keeps the current page and playback until the invitation is accepted", async () => {
  const ticket = { roomId: id, token, role: "host", peerAlias: "听众 B" };
  respond = async () => response({ ...nearby({ ticket }), token });
  await mount("nearby"); await act(async () => current.request("start", { trackId: audioTracks[0].id }));
  assert.equal(current.room, null); assert.equal(current.joined, null);
  assert.equal(sessionStorage.getItem("resonance.nearby-room.account-a.active"), null);
  assert.equal(calls.some(item => item.pause || item.play || item.route || item.url?.endsWith("stop")), false);
  const accept = [...document.querySelectorAll("button")].find(button => button.textContent === "加入一起听");
  assert.ok(accept); assert.match(document.body.textContent, /听众 B 想和你一起听/);
  respond = async url => response(url.endsWith("stop") ? {} : nearby({ ticket }));
  await act(async () => accept.click());
  assert.deepEqual(JSON.parse(calls.find(item => item.url?.endsWith("accept")).options.body), { roomId: id });
  assert.equal(current.room, id); assert.deepEqual(current.joined, ticket);
});

test("cancelled invitations disappear on the next poll and a failed accept never enters", async () => {
  const ticket = { roomId: id, token, role: "host", peerAlias: "听众 B" };
  respond = async () => response({ ...nearby({ ticket }), token });
  await mount("nearby"); await act(async () => current.request("start", {}));
  respond = async () => response({ error: "UNAVAILABLE" }, 409);
  await act(async () => current.request("accept", { roomId: id }));
  assert.equal(current.room, null); assert.match(current.error, /已离开/);
  respond = async () => response(nearby());
  await act(async () => current.request("state"));
  assert.equal(document.querySelector(".tp-invitation"), null);
  assert.equal(current.room, null);
});

test("declining waits for acknowledgement, keeps playback and discovery, and leaves failures retryable", async () => {
  const ticket = { roomId: id, token, role: 'host', peerAlias: '听众 B' };
  respond = async () => response({ ...nearby({ ticket }), token });
  await mount('nearby'); await act(async () => current.request('start', {}));
  const decline = () => [...document.querySelectorAll('button')].find(button => button.textContent === '暂不加入');
  let complete;
  respond = () => new Promise(resolve => { complete = resolve; });
  await act(async () => decline().click());
  assert.equal(decline().disabled, true); assert.ok(document.querySelector('.tp-invitation'));
  await act(async () => complete(response({ error: 'CONNECT_FAILED' }, 503)));
  assert.ok(document.querySelector('.tp-invitation')); assert.match(current.error, /没连上/);
  respond = async url => response(url.endsWith('/decline') ? nearby() : nearby({ ticket }));
  await act(async () => current.request('state'));
  await act(async () => decline().click());
  assert.deepEqual(JSON.parse(calls.find(item => item.url?.endsWith('/decline')).options.body), { roomId: id });
  assert.equal(document.querySelector('.tp-invitation'), null);
  assert.equal(current.room, null); assert.ok(current.snapshot);
  assert.equal(calls.some(item => item.pause || item.play || item.route || item.url?.endsWith('/stop')), false);
});

test("a queued follow is discarded after offline; late poll cannot restore readiness", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  await mount("nearby"); await act(async () => current.request("start", {}));
  let complete;
  respond = () => new Promise(resolve => { complete = resolve; });
  let polling, following;
  await act(async () => { polling = current.request("state"); following = current.request("follow", { targetId: token }); });
  await network(false);
  await act(async () => { complete(response(nearby())); await polling; t.mock.timers.tick(50); await following; });
  assert.equal(current.ready, false);
  assert.equal(calls.some(item => item.url?.endsWith("follow")), false);
});

test("late successful start after pagehide is stopped, never shown or entered", async () => {
  let complete, starting;
  respond = () => new Promise(resolve => { complete = resolve; });
  await mount("nearby");
  await act(async () => { starting = current.request("start", {}); });
  await act(async () => window.dispatchEvent(new window.Event("pagehide")));
  await act(async () => { complete(response({ ...nearby({ ticket: { roomId: id, token } }), token })); await starting; });
  assert.equal(current.snapshot, null); assert.equal(current.room, null);
  assert.equal(calls.some(item => item.route), false);
  assert.equal(calls.filter(item => item.url?.endsWith("stop")).length, 1);
});

test("room ticket enters in place: presence stops, no navigation, leaving clears it", async () => {
  await mount("nearby"); await act(async () => current.request("start", {}));
  respond = async url => response(url.includes("stop") ? {} : nearby({ ticket: { roomId: id, token } }));
  await act(async () => current.request("state"));
  assert.equal(current.room, id); assert.equal(current.snapshot, null);
  assert.equal(sessionStorage.getItem("resonance.nearby-room.account-a.active"), id);
  assert.equal(calls.filter(item => item.url?.endsWith("stop")).length, 1);
  assert.equal(calls.some(item => item.route), false);
  await act(async () => current.leaveSession());
  assert.equal(current.room, null);
  assert.equal(sessionStorage.getItem("resonance.nearby-room.account-a.active"), null);
});

test("room unmount disconnects without leaving, retains the tab identity, and ignores stale socket messages", async () => {
  await mount(); const old = await welcome();
  const hello = old.sent.find(message => message.type === 'hello');
  await act(async () => root.render(null));
  assert.equal(old.readyState, 3);
  assert.equal(old.sent.some(message => message.type === 'leave'), false);
  assert.equal(sessionStorage.getItem(`resonance.nearby-room.account-a.${id}`), token);
  await mount(); const replacement = await welcome();
  const nextHello = replacement.sent.find(message => message.type === 'hello');
  assert.equal(nextHello.clientId, hello.clientId, 'refresh/remount retains the reserved seat');
  assert.equal(nextHello.token, hello.token);
  await act(async () => old.message({ type: 'state', room: room({ closed: true, revision: 999 }), serverTime: Date.now() }));
  assert.equal(current.connection, 'connected');
  assert.equal(current.room.closed, false);
  await act(async () => current.leave());
  assert.equal(replacement.sent.filter(message => message.type === 'leave').length, 1, 'explicit exit still leaves the room');
});

test("unmount during a pending room probe cannot open a late socket", async () => {
  let complete;
  respond = () => new Promise(resolve => { complete = resolve; });
  await mount();
  await act(async () => root.render(null));
  await act(async () => complete(response({ active: true })));
  assert.equal(sockets.length, 0);
});

test("StrictMode room setup can reconnect without sending an accidental leave", async () => {
  recoveryTest.host = { session: recoveryTest.session, save: async () => true };
  await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(RoomSession, { roomId: id, player, variant: 'inline', onExit() {} }))));
  await flush();
  assert.equal(sockets.length, 1, 'the cancelled first setup does not open another socket');
  await welcome();
  await act(async () => root.render(null));
  assert.equal(sockets[0].sent.some(message => message.type === 'leave'), false);
});

test("inline room joins on mount without a confirm screen and exits without navigation", async () => {
  let exited = 0;
  recoveryTest.host = { session: recoveryTest.session, save: async () => true, dataError: null };
  Object.assign(player, { currentTime: 2, volume: 1, error: null, stop() { calls.push({ stop: true }); }, changeVolume() {} });
  await act(async () => root.render(React.createElement(RoomSession, { roomId: id, player, variant: "inline", onExit: () => exited++ })));
  await flush();
  assert.equal(sockets.length, 1);
  assert.equal(document.body.textContent.includes("打开声音，开始听"), false);
  await welcome();
  const end = [...document.querySelectorAll("button")].find(button => button.textContent === "结束一起听");
  await act(async () => end.click());
  assert.equal(exited, 1);
  assert.ok(calls.some(item => item.stop));
  assert.equal(calls.some(item => item.route), false);
  assert.equal(sockets[0].sent.at(-1).type, "leave");
});

test("inviter waits with a cancellable loading signal until the host joins", async () => {
  recoveryTest.host = { session: recoveryTest.session, save: async () => true };
  await act(async () => root.render(React.createElement(RoomSession, { roomId: id, peerAlias: "听众 B", player, variant: "inline", onExit() {} })));
  const socket = sockets.at(-1);
  await act(async () => { socket.open(); socket.message({ type: "welcome", role: "guest", room: room({ hostConnected: false, guestConnected: true, playback: { trackId: audioTracks[0].id, position: 0, playing: false, updatedAt: Date.now() } }), serverTime: Date.now() }); });
  assert.match(document.querySelector(".tp-room-waiting").textContent, /正在等 听众 B 加入/);
  assert.equal(document.querySelectorAll(".tp-waiting-signal i").length, 3);
  assert.ok([...document.querySelectorAll("button")].some(button => button.textContent === "取消等待"));
  assert.equal(document.querySelector(".tp-room-progress"), null);
  assert.equal(document.querySelector(".reaction-dock"), null);
  await act(async () => socket.message({ type: "state", room: room(), serverTime: Date.now() }));
  assert.equal(document.querySelector(".tp-room-waiting"), null);
  assert.ok(document.querySelector(".tp-room-progress"));
  await act(async () => socket.message({ type: "state", room: room({ hostConnected: false }), serverTime: Date.now() }));
  assert.equal(document.querySelector(".tp-room-waiting"), null, "a later disconnect must not look like an unanswered invitation");
});

test("followed host carries on from the same spot: seek, then play once the room has it", async () => {
  recoveryTest.host = { session: recoveryTest.session, save: async () => true, dataError: null };
  Object.assign(player, { status: "playing", wantsPlayback: true, currentTime: 30, volume: 1, error: null, stop() {}, changeVolume() {} });
  await act(async () => root.render(React.createElement(RoomSession, { roomId: id, player, variant: "inline", onExit() {} })));
  await flush();
  const socket = sockets.at(-1);
  const fresh = { revision: 2, playback: { trackId: audioTracks[0].id, position: 0, playing: false, updatedAt: Date.now() } };
  await act(async () => { socket.open(); socket.message({ type: "welcome", role: "host", room: room(fresh), serverTime: Date.now() }); });
  const commands = () => socket.sent.filter(item => item.type === "command");
  assert.deepEqual(commands().map(item => [item.action, item.position, item.revision]), [["seek", 30, 2]]);
  await act(async () => socket.message({ type: "state", room: room({ revision: 3, playback: { ...fresh.playback, position: 30 } }), serverTime: Date.now() }));
  assert.deepEqual(commands().map(item => item.action), ["seek", "play"]);
  await act(async () => socket.message({ type: "state", room: room({ revision: 4, playback: { ...fresh.playback, position: 30, playing: true } }), serverTime: Date.now() }));
  assert.equal(commands().length, 2);
});

test("pause discovery while offline stays paused after reconnection", async () => {
  await mount("nearby"); await act(async () => current.request("start", {}));
  await network(false); await act(async () => current.request("stop", {}));
  assert.equal(current.snapshot, null);
  const count = calls.length;
  await network(true); await flush();
  assert.equal(calls.length, count);
});

test("server-backed reaction survives remount and only notifies the claimed response", async () => {
  const replies = []; let queued = 0;
  recoveryTest.host = { data: { demoReplies: [] }, save: async (action, trackId, id) => {
    queued++; recoveryTest.host.data = { demoReplies: [{ id, trackId, kind: "wave", status: "pending", notified: false, dueAt: Date.now() + 2600 }] }; return true;
  }, claimReply: async id => {
    const item = recoveryTest.host.data.demoReplies.find(item => item.id === id);
    if (item.notified) return null;
    item.notified = true; return { ...item };
  } };
  function Harness() { current = useDemoReplies(reply => replies.push(reply)); return null; }
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => current.sendReaction("heart", audioTracks[0].id));
  await act(async () => current.sendReaction("heart", audioTracks[1].id));
  assert.equal(queued, 1); assert.equal(current.reaction.status, "sent");
  await act(async () => root.render(null));
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(current.reaction.status, "sent"); assert.equal(replies.length, 0);
  recoveryTest.host.data.demoReplies = recoveryTest.host.data.demoReplies.map(item => ({ ...item, status: "ready" }));
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(replies.length, 1); assert.equal(replies[0].trackId, audioTracks[0].id);
  await act(async () => root.render(null));
  await act(async () => root.render(React.createElement(Harness)));
  assert.equal(replies.length, 1);
});

test("online reaction never invents a simulated reply after the demo duration", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  await act(async () => root.render(React.createElement(ReactionDock, { mode: "online", outgoing: { id: token, kind: "heart", status: "sent" }, onSend() {} })));
  await act(async () => t.mock.timers.tick(3000));
  assert.match(document.body.textContent, /已发出，等 TA 收到/);
  assert.equal(document.querySelector(".demo-response-motion"), null);
  assert.equal(document.body.textContent.includes("TA 也喜欢这首歌"), false);
});

test("a late claimed reply does not notify after the account experience unmounts", async () => {
  let finish; const replies = [];
  recoveryTest.host = { data: { demoReplies: [{ id: token, kind: "heart", trackId: audioTracks[0].id, status: "ready", notified: false }] }, claimReply: () => new Promise(resolve => { finish = resolve; }) };
  function Harness() { current = useDemoReplies(reply => replies.push(reply)); return null; }
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => root.render(null));
  await act(async () => finish(recoveryTest.host.data.demoReplies[0]));
  assert.equal(replies.length, 0);
});

test("demo listeners share the nearby and room screens; a gift is one-way and lands in the journey", async t => {
  t.mock.method(window.HTMLMediaElement.prototype, "load", () => {});
  t.mock.method(window.HTMLMediaElement.prototype, "pause", () => {});
  t.mock.method(window.HTMLMediaElement.prototype, "play", () => Promise.resolve());
  window.HTMLElement.prototype.scrollTo = () => {};
  const actions = [];
  recoveryTest.toasts = [];
  recoveryTest.host = {
    data: { favoriteIds: [], listenLaterIds: [], events: [], history: [], onlineExchanges: [], demoReplies: [] },
    save: async (action, trackId, id, event) => {
      actions.push(action);
      if (action === "event") recoveryTest.host.data = { ...recoveryTest.host.data, events: [...recoveryTest.host.data.events, event] };
      return true;
    },
    claimReply: async () => null,
  };
  await act(async () => root.render(React.createElement(ResonanceExperience, { onlinePanel: null, onlineActive: false, onPauseOnline() {}, initialSource: "demo" })));
  const click = async label => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label || item.getAttribute("aria-label") === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => button.click());
  };
  assert.ok(document.querySelector(".tp-nearby"), "demo listeners use the same nearby radar as real ones");
  assert.equal(document.querySelectorAll(".orbit-listener").length, audioTracks.length);
  assert.deepEqual([...document.querySelectorAll(".orbit-listener")].map(button => button.getAttribute("aria-label")), audioTracks.map(track => `查看在线歌曲 ${track.track}`));
  assert.equal(document.querySelector(".tp-mode-options"), null);
  assert.equal(document.querySelector(".tp-listener-note"), null);
  assert.equal(document.querySelector(".phone-stage__content").textContent.includes("模拟"), false);
  await click("跟 TA 一起听");
  assert.ok(document.querySelector(".tp-room-session"), "following a demo listener opens the shared room screen");
  assert.equal(document.querySelector(".bottom-nav"), null);
  assert.equal(document.querySelector(".tp-room-status").textContent, "已连接");
  assert.equal(document.querySelector(".tp-demo-caption"), null);
  await click("挑一首");
  const send = [...document.querySelectorAll("button")].find(item => item.textContent.startsWith("送出《"));
  assert.ok(send);
  await act(async () => send.click());
  const gifts = recoveryTest.host.data.events.filter(event => event.type === "exchange");
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0].receivedTrackId, undefined);
  assert.ok(!actions.includes("queueExchange"), "no reply song is queued");
  assert.match(document.body.textContent, /已送给 TA/);
  assert.equal(recoveryTest.toasts.length, 0);
  await click("结束一起听");
  assert.equal(document.querySelector(".tp-room-session"), null);
  await click("足迹与收藏");
  assert.match(document.body.textContent, /一起听时送给 TA/);
  const total = [...document.querySelectorAll(".stat-grid article")].find(item => item.textContent.includes("今日送歌"));
  assert.equal(total.querySelector("strong").textContent, "1");
});

test("login owns the experience choice and normal A/B login switches back to online mode", async () => {
  recoveryTest.host = { status: "signed-out", session: null };
  const choices = [];
  await act(async () => root.render(React.createElement(HostStatus, { onSelectSource: source => choices.push(source) })));
  const experience = [...document.querySelectorAll("button")].find(button => button.textContent === "单人体验");
  assert.ok(experience); assert.match(document.body.textContent, /模拟听众自动回应/);
  let finish;
  recoveryTest.loginResult = new Promise(resolve => { finish = resolve; });
  await act(async () => experience.click());
  assert.deepEqual(choices, ["demo"]); assert.deepEqual(recoveryTest.logins, ["A"]);
  assert.ok([...document.querySelectorAll("button")].every(button => button.disabled));
  await act(async () => finish({ status: "ready" }));
  recoveryTest.loginResult = { status: "ready" };
  await act(async () => document.querySelector('button[aria-label="登录听众 B"]').click());
  assert.deepEqual(choices, ["demo", "online"]); assert.deepEqual(recoveryTest.logins, ["A", "B"]);
});

test("received list does not mark on mount; opening unavailable songs supports read failure and retry", async () => {
  const item = { id: "demo:receipt", sentTrackId: "removed-a", receivedTrackId: "removed-b", receivedAt: Date.now(), unread: true };
  let reads = 0;
  const onRead = async id => { assert.equal(id, item.id); reads++; return reads > 1; };
  await act(async () => root.render(React.createElement(ReceivedSongs, { items: [item], onRead, onPlay() { assert.fail("Removed track must not play"); } })));
  assert.equal(reads, 0);
  const button = document.querySelector('[aria-expanded="false"]');
  await act(async () => button.click());
  assert.equal(reads, 1); assert.match(document.body.textContent, /已读状态未保存/);
  assert.match(document.body.textContent, /未读/); assert.match(document.body.textContent, /歌曲已下架/);
  await act(async () => [...document.querySelectorAll("button")].find(item => item.textContent === "重试").click());
  assert.equal(reads, 2);
  await act(async () => root.render(React.createElement(ReceivedSongs, { items: [{ ...item, unread: false }], onRead, onPlay() {} })));
  assert.equal(document.querySelector('[data-unread="true"]'), null);
});

test("journey exchange total matches its deduplicated mixed-source history", async () => {
  const now = new Date().toISOString();
  const event = { id: "same", type: "exchange", trackId: audioTracks[0].id, receivedTrackId: audioTracks[1].id, scene: "cafe", listenerId: "listener", createdAt: now };
  const online = { id: "same", roomId: "first", sentTrackId: audioTracks[0].id, receivedTrackId: audioTracks[1].id, completedAt: Date.parse(now) };
  await act(async () => root.render(React.createElement(JourneySummary, {
    library: { version: 1, favoriteIds: [], listenLaterIds: [], events: [event, event] },
    onlineExchanges: [online, online, { ...online, roomId: "second" }],
    onPlayTrack() {}, onRemoveFavorite() {}, onRemoveLater() {},
  })));
  const total = [...document.querySelectorAll('.stat-grid article')].find(item => item.textContent.includes('今日送歌'));
  assert.equal(total.querySelector('strong').textContent, '3');
  assert.equal(document.querySelectorAll('.journey-event').length, 3);
});

test("journey has two tabs: gifts sit above the timeline, favorites and later share one tab", async () => {
  const received = [0, 1, 2, 3].map(index => ({ id: `online:room:${index}`, receivedTrackId: audioTracks[index % audioTracks.length].id, receivedAt: Date.now() - index, unread: index === 0 }));
  await act(async () => root.render(React.createElement(JourneySummary, {
    library: { version: 1, favoriteIds: [audioTracks[0].id], listenLaterIds: [], events: [] },
    received, onPlayTrack() {}, onRemoveFavorite() {}, onRemoveLater() {},
  })));
  const segments = [...document.querySelectorAll('.tp-segments button')];
  assert.deepEqual(segments.map(item => item.getAttribute('aria-label')), ['足迹，1 首送你的歌未读', '收藏与待听 1']);
  assert.equal(document.querySelectorAll('.tp-letter').length, 3);
  assert.match(document.body.textContent, /TA 送你的/);
  await act(async () => segments[1].click());
  assert.equal(document.querySelectorAll('.tp-wall li').length, 1);
  assert.match(document.body.textContent, /待听/); assert.match(document.body.textContent, /稍后再听/);
});

test("host notification waits for an explicit click, keeps the latest handler and dismisses stale invitations", async () => {
  let accepted = 0;
  function Harness({ ticket, onAccept = () => accepted++ }) { useFollowerNotification(ticket, onAccept); return null; }
  const ticket = { roomId: id, token, role: "host", peerAlias: "听众 B" };
  await act(async () => root.render(React.createElement(Harness, { ticket })));
  await act(async () => root.render(React.createElement(Harness, { ticket: { ...ticket } })));
  assert.equal(recoveryTest.toasts.length, 1);
  assert.equal(accepted, 0);
  assert.equal(recoveryTest.toasts[0].title, "听众 B 想和你一起听");
  assert.equal(recoveryTest.toasts[0].action.label, "加入一起听");
  await act(async () => root.render(React.createElement(Harness, { ticket, onAccept: () => accepted += 2 })));
  await act(async () => recoveryTest.toasts[0].action.onClick());
  assert.equal(accepted, 2);
  await act(async () => root.render(React.createElement(Harness, { ticket: { ...ticket, roomId: token, role: "guest" } })));
  assert.equal(recoveryTest.toasts.length, 1);
  assert.ok(recoveryTest.dismissedToasts.includes(`nearby-follower-${id}`));
});

test("invitation toast offers decline and stale toast actions cannot affect a newer invitation", async () => {
  let accepted = 0, declined = 0;
  function Harness({ ticket, count = 1 }) { useFollowerNotification(ticket, () => accepted += count, () => declined += count); return null; }
  const ticket = { roomId: id, token, role: 'host', peerAlias: '听众 B' };
  await act(async () => root.render(React.createElement(Harness, { ticket })));
  const first = recoveryTest.toasts[0];
  assert.equal(first.cancel.label, '暂不加入'); assert.equal(declined, 0);
  await act(async () => root.render(React.createElement(Harness, { ticket, count: 2 })));
  await act(async () => first.cancel.onClick());
  assert.equal(declined, 2);
  await act(async () => root.render(React.createElement(Harness, { ticket: { ...ticket, roomId: token } })));
  await act(async () => { first.cancel.onClick(); first.action.onClick(); });
  assert.equal(declined, 2); assert.equal(accepted, 0);
  await act(async () => recoveryTest.toasts[1].cancel.onClick());
  assert.equal(declined, 3);
});

test("room gift toasts only the recipient, once per gift", async () => {
  const gift = { id: token, from: "host", status: "completed", offeredTrackId: audioTracks[0].id, createdAt: Date.now(), completedAt: Date.now(), saved: {host:false,guest:false} };
  function Harness({ state, role }) { useRoomExchangeNotification(state, role, true); return null; }
  await act(async () => root.render(React.createElement(Harness, { state: room({ exchange: gift }), role: "host" })));
  assert.equal(recoveryTest.toasts.length, 0);
  await act(async () => root.render(React.createElement(Harness, { state: room({ exchange: gift }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 1); assert.equal(recoveryTest.toasts[0].title, "TA 送你一首歌");
  assert.equal(recoveryTest.toasts[0].description, `《${audioTracks[0].track}》`);
  await act(async () => root.render(React.createElement(Harness, { state: room({ revision: 2, exchange: { ...gift, saved: {host:true,guest:true} } }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 1);
  await act(async () => root.render(React.createElement(Harness, { state: room({ revision: 3, exchange: { ...gift, id: crypto.randomUUID(), offeredTrackId: audioTracks[1].id } }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 2); assert.equal(recoveryTest.toasts[1].description, `《${audioTracks[1].track}》`);
});

test("current playback bar keeps paused song changes paused, wraps tracks and plays playlist choices", async () => {
  const actions = [];
  recoveryTest.host = { trackId: audioTracks[0].id, data: {favoriteIds: []}, save: async () => true };
  const playback = { ...player, currentTime: 0, wantsPlayback: false, track: audioTracks[0], status: "loading",
    prepareTrack(track) { actions.push(['prepare', track.id]); playback.track = track; playback.wantsPlayback = false; },
    playTrack(track) { actions.push(['play', track.id]); playback.track = track; playback.wantsPlayback = true; return Promise.resolve(true); },
  };
  const render = () => act(async () => root.render(React.createElement(CurrentPlaybackBar, { player: playback })));
  const click = label => act(async () => document.querySelector(`button[aria-label="${label}"]`).click());
  await render();
  await click('下一首');
  assert.deepEqual(actions.at(-1), ['prepare', audioTracks[1].id]);
  assert.equal(recoveryTest.host.trackId, audioTracks[1].id);
  await render(); await click('打开播放列表');
  await click(`播放 ${audioTracks.at(-1).track}`);
  assert.deepEqual(actions.at(-1), ['play', audioTracks.at(-1).id]);
  assert.equal(recoveryTest.host.trackId, audioTracks.at(-1).id);
  await render(); await click('下一首');
  assert.deepEqual(actions.at(-1), ['play', audioTracks[0].id]);
});

test("radar is visible without opening a disclosure and only renders actual listener snapshots", async () => {
  await mount("nearby");
  assert.ok(document.querySelector('.orbit-map'));
  assert.equal(document.querySelector('.orbit-map').closest('details'), null);
  assert.equal(document.querySelectorAll('.orbit-listener').length, 0);
  respond = async () => response({ ...nearby({ peers: [{ id: token, alias: "听众 B", trackId: audioTracks[1].id }] }), token });
  await act(async () => current.request("start", { trackId: audioTracks[0].id }));
  assert.equal(document.querySelectorAll('.orbit-listener').length, 1);
  assert.equal(document.querySelector('.orbit-listener').getAttribute('aria-label'), `查看在线歌曲 ${audioTracks[1].track}`);
  assert.equal(document.querySelector('.orbit-map').getAttribute('data-active'), 'true');
});


test("blocking requires confirmation, leaves failed requests retryable, and reports success only after acknowledgement", async () => {
  let completed = 0;
  respond = async () => { throw new TypeError('offline'); };
  await act(async () => root.render(React.createElement(BlockListenerButton, { target: { targetId: id }, alias: '听众 B', onBlocked: () => completed++ })));
  await act(async () => document.querySelector('.listener-block-trigger').click());
  assert.equal(calls.length, 0);
  const confirm = () => [...document.querySelectorAll('button')].find(button => button.textContent === '确认屏蔽');
  await act(async () => confirm().click());
  assert.equal(completed, 0);
  assert.match(document.querySelector('[role="alert"]').textContent, /结果未确认/);
  respond = async () => response({ blocks: [{ id: token, alias: '听众 B', createdAt: Date.now() }] });
  await act(async () => confirm().click());
  assert.equal(completed, 1);
  assert.match(document.querySelector('[role="status"]').textContent, /已屏蔽/);
});

test("late safety responses after account switch cannot expire the new account or update its UI", async () => {
  let finish;
  respond = () => new Promise(resolve => { finish = resolve; });
  function Harness() { current = useListenerSafety(); return null; }
  await act(async () => root.render(React.createElement(Harness)));
  let pending;
  await act(async () => { pending = current.run('block', { targetId: id }); });
  recoveryTest.session = { ...recoveryTest.session, accountId: 'account-b', token: id };
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => finish(response({ error: 'AUTH_EXPIRED' }, 401)));
  assert.equal(await pending, null);
  assert.equal(recoveryTest.expired, 0);
  assert.equal(current.error, '');
  assert.equal(current.busy, false);
});


test("music connection updates with the current song and selected listener without inventing matches", async () => {
  const track = audioTracks[0];
  const sameArtist = audioTracks.find(item => item.id !== track.id && item.artist === track.artist);
  const otherArtist = audioTracks.find(item => item.artist !== track.artist);
  assert.ok(sameArtist); assert.ok(otherArtist);
  const connection = { snapshot: nearby({ peers: [{ id: token, alias: "听众 B", trackId: track.id }, { id: "listener-c", alias: "听众 C", trackId: otherArtist.id }] }), busy: false, error: null, ready: true, online: true, request: async () => {} };
  const render = currentTrackId => act(async () => root.render(React.createElement(OnlineNearbyPanel, { nearby: connection, currentTrackId })));
  const label = () => document.querySelector('.tp-music-connection')?.textContent ?? null;
  await render(track.id);
  assert.equal(label(), '与你同曲');
  await render(sameArtist.id);
  assert.equal(label(), '同一位歌手');
  await render(otherArtist.id);
  assert.equal(label(), null, 'unrelated music does not imply shared taste');
  await act(async () => [...document.querySelectorAll('.tp-chip')].find(button => button.textContent.includes('听众 C')).click());
  assert.equal(label(), '与你同曲', 'selecting a listener recomputes the connection');
  await render(null);
  assert.equal(label(), null, 'a missing current song has no match');
  await render('missing-track');
  assert.equal(label(), null, 'an unknown current song has no match');
});

test("record effects follow actual playback, respect quiet mode and visibility, and reuse the existing player", async () => {
  const track = audioTracks[0];
  let paused = 0, played = 0;
  const playback = { ...player, track, status: 'loading', wantsPlayback: true, pause: () => paused++, playTrack: async () => { played++; return true; } };
  const connection = { snapshot: nearby(), busy: false, error: null, ready: true, online: true, now: Date.now(), room: null, request: async () => {}, leaveSession() {} };
  const render = () => act(async () => root.render(React.createElement(OnlineNearbyPanel, { nearby: connection, currentTrackId: track.id, player: playback })));
  await render();
  const map = () => document.querySelector('.orbit-map');
  assert.equal(map().dataset.active, 'true');
  assert.equal(map().dataset.playing, 'false', 'discovery and buffering do not animate a playing record');
  playback.status = 'playing'; await render();
  assert.equal(map().dataset.playing, 'true');
  await act(async () => document.querySelector('.orbit-self').click());
  assert.equal(paused, 1);
  playback.status = 'paused'; playback.wantsPlayback = false; await render();
  assert.equal(map().dataset.playing, 'false');
  await act(async () => document.querySelector('.orbit-self').click());
  assert.equal(played, 1);
  playback.status = 'playing'; playback.wantsPlayback = true; await render();
  await act(async () => document.querySelector('.orbit-motion-toggle').click());
  assert.equal(map().dataset.motion, 'false');
  assert.equal(paused, 1, 'turning motion off does not pause music');
  await act(async () => document.querySelector('.orbit-motion-toggle').click());
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await act(async () => document.dispatchEvent(new window.Event('visibilitychange')));
  assert.equal(map().dataset.motion, 'false');
  assert.equal(document.querySelectorAll('audio').length, 0, 'the radar never creates a second player');
  playback.track = audioTracks[1]; await render();
  assert.equal(map().dataset.playing, 'false', 'a different track cannot animate this record');
});


test("avatar gestures identify the sender, never turn delivery acknowledgement into a peer reply, and ignore other songs", async () => {
  const track = audioTracks[0];
  let outgoing = null, incoming = null;
  const render = () => act(async () => root.render(React.createElement(ListeningArtwork, { track, mode: 'online', role: 'guest', outgoing, incoming })));
  await render();
  outgoing = { id: 'hello-self', kind: 'heart', trackId: track.id, status: 'sending' }; await render();
  assert.equal(document.querySelector('[data-person="self"] .listener-avatar-face').dataset.gesture, 'heart');
  const face = document.querySelector('[data-person="self"] .listener-avatar-face');
  outgoing = { ...outgoing, status: 'received' }; await render();
  assert.equal(document.querySelector('[data-person="self"] .listener-avatar-face'), face, 'acknowledgement does not restart the sender animation');
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, undefined);
  incoming = { id: 'hello-other-song', from: 'host', kind: 'heart', trackId: audioTracks[1].id, createdAt: Date.now() }; await render();
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, undefined);
  incoming = { ...incoming, id: 'hello-peer', trackId: track.id }; await render();
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, 'heart');
  incoming = { ...incoming, id: 'wrong-sender', from: 'guest' }; await render();
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, undefined);
  outgoing = { ...outgoing, status: 'failed' }; await render();
  assert.equal(document.querySelector('[data-person="self"] .listener-avatar-face').dataset.gesture, undefined);
});

test("demo avatars wait for the saved reply; historical reactions do not replay when entering the view", async () => {
  const track = audioTracks[0];
  let outgoing = { id: 'old', kind: 'heart', trackId: track.id, status: 'received' };
  const render = () => act(async () => root.render(React.createElement(ListeningArtwork, { track, mode: 'demo', outgoing })));
  await render();
  assert.equal(document.querySelectorAll('[data-gesture]').length, 0);
  outgoing = { ...outgoing, id: 'new', status: 'sent' }; await render();
  assert.equal(document.querySelector('[data-person="self"] .listener-avatar-face').dataset.gesture, 'heart');
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, undefined);
  outgoing = { ...outgoing, status: 'received' }; await render();
  assert.equal(document.querySelector('[data-person="peer"] .listener-avatar-face').dataset.gesture, 'heart');
  await act(async () => new Promise(resolve => setTimeout(resolve, 2700)));
  assert.equal(document.querySelectorAll('[data-gesture]').length, 0, 'completed gestures cannot replay when quiet mode is changed');
});
