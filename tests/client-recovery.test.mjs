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
  stdin: { contents: `export { CurrentPlaybackBar } from './components/resonance/CurrentPlaybackBar'; export { useIncomingInviteNotification, useRoomExchangeNotification } from './hooks/useOnlineNotifications'; export { JourneySummary } from './components/resonance/JourneySummary'; export { ReceivedSongs } from './components/resonance/ReceivedSongs'; export { ResonanceExperience } from './components/resonance/ResonanceExperience'; export { useDemoReplies } from './hooks/useDemoReplies'; export { ReactionDock } from './components/resonance/ReactionDock'; export { useNearby } from './hooks/useNearby'; export { useListeningRoom } from './hooks/useListeningRoom'; export { useRoomAudio } from './hooks/useRoomAudio'; export { OnlineNearbyPanel } from './components/resonance/OnlineNearbyPanel'; export { audioTracks } from './lib/resonance/demo-data';`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "node", format: "esm", packages: "external", write: false,
  plugins: [{ name: "test-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(sonner|@\/components\/ui\/sonner)$/ }, args => ({ path: args.path, namespace: "toast" }));
    builder.onLoad({ filter: /.*/, namespace: "toast" }, args => ({ contents: args.path === "sonner" ? "export const toast = Object.assign((title, options) => { globalThis.recoveryTest.toasts.push({title, ...options}); return options.id; }, { dismiss(id) { globalThis.recoveryTest.dismissedToasts?.push(id); } });" : "export const Toaster = () => null;" }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "image" }));
    builder.onLoad({ filter: /.*/, namespace: "image" }, () => ({ resolveDir: process.cwd(), contents: "import React from 'react'; export default function Image({fill, unoptimized, priority, ...props}) { return React.createElement('img', props); }" }));
    builder.onResolve({ filter: /^(next\/navigation|\.\/HostProvider|@\/components\/resonance\/HostProvider|@\/lib\/resonance\/demo-host)$/ }, args => ({ path: args.path, namespace: "boundary" }));
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ contents: args.path.includes("navigation") ? "export const useRouter = () => globalThis.recoveryTest.router;" : args.path.includes("HostProvider") ? "export const useHost = () => globalThis.recoveryTest.host ?? ({session: globalThis.recoveryTest.session});" : "export const hostFetch = async () => { throw new Error('Unexpected host request in this test'); }; export const demoHost = {setTrack: id => { globalThis.recoveryTest.host.trackId = id; }, expire: () => globalThis.recoveryTest.expired++};" }));
  } }],
});
await writeFile(bundle, result.outputFiles[0].text);
const { CurrentPlaybackBar, useIncomingInviteNotification, useRoomExchangeNotification, JourneySummary, ReceivedSongs, ResonanceExperience, useDemoReplies, ReactionDock, useNearby, useListeningRoom, useRoomAudio, OnlineNearbyPanel, audioTracks } = await import(pathToFileURL(bundle));
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
const nearby = (extra = {}) => ({ self: { id, alias: "听众 A", trackId: audioTracks[0].id }, peers: [], invite: null, ticket: null, serverTime: Date.now(), ...extra });
const pendingInvite = () => ({ id: token, from: token, to: id, fromAlias: "听众 B", toAlias: "听众 A", trackId: audioTracks[0].id, status: "pending", expiresAt: Date.now() + 45000 });
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
  await act(async () => { current.command("play"); current.sendReaction("heart"); current.sendExchange("offer", { trackId: audioTracks[0].id }); });
  assert.equal(socket.sent.length, count);
  await act(async () => socket.message({ type: "state", room: room(), serverTime: Date.now() }));
  assert.equal(player.status, "paused");
  const ping = socket.sent.at(-1);
  await act(async () => socket.message({ type: "state", room: room(), serverTime: Date.now(), sentAt: ping.sentAt }));
  assert.equal(current.connection, "connected"); assert.equal(player.status, "playing");
});

test("offline pauses audio, exchange is not replayed; explicit retry retains its request id", async () => {
  await mount(); const first = await welcome();
  await act(async () => current.sendExchange("offer", { trackId: audioTracks[0].id }));
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
  await act(async () => current.sendExchange("offer", { trackId: audioTracks[0].id }));
  await network(false); respond = async () => response({}, 404);
  await network(true);
  assert.equal(current.connection, "closed"); assert.equal(current.exchangeRequest, "idle");
  const count = calls.length;
  await act(async () => window.dispatchEvent(new window.Event("pageshow")));
  assert.equal(calls.length, count);
});

test("invitation clock advances offline, disables acceptance and does not auto-start expired presence", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  respond = async () => response({ ...nearby({ invite: pendingInvite() }), token });
  await mount("nearby"); await act(async () => current.request("start", { trackId: audioTracks[0].id }));
  const accept = () => [...document.querySelectorAll("button")].find(button => button.textContent.includes("接受，一起听"));
  assert.equal(accept().disabled, false);
  await network(false); assert.equal(accept().disabled, true);
  await act(async () => t.mock.timers.tick(46000));
  assert.match(document.body.textContent, /邀请已到期/);
  const count = calls.length;
  await act(async () => current.request("respond", { inviteId: token, decision: "accept" }));
  assert.equal(calls.length, count);
  respond = async () => response({ error: "SESSION_EXPIRED" }, 401);
  await network(true);
  assert.equal(current.snapshot, null); assert.match(current.error, /发现已暂停/);
  assert.equal(calls.filter(item => item.url?.endsWith("start")).length, 1);
});

test("a queued invitation is discarded after offline; late poll cannot restore readiness", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  await mount("nearby"); await act(async () => current.request("start", {}));
  let complete;
  respond = () => new Promise(resolve => { complete = resolve; });
  let polling, inviting;
  await act(async () => { polling = current.request("state"); inviting = current.request("invite", { targetId: token }); });
  await network(false);
  await act(async () => { complete(response(nearby())); await polling; t.mock.timers.tick(50); await inviting; });
  assert.equal(current.ready, false);
  assert.equal(calls.some(item => item.url?.endsWith("invite")), false);
});

test("late successful start after pagehide is stopped, never shown or navigated", async () => {
  let complete, starting;
  respond = () => new Promise(resolve => { complete = resolve; });
  await mount("nearby");
  await act(async () => { starting = current.request("start", {}); });
  await act(async () => window.dispatchEvent(new window.Event("pagehide")));
  await act(async () => { complete(response({ ...nearby({ ticket: { roomId: id, token } }), token })); await starting; });
  assert.equal(current.snapshot, null);
  assert.equal(calls.some(item => item.route), false);
  assert.equal(calls.filter(item => item.url?.endsWith("stop")).length, 1);
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
  await act(async () => current.sendReaction("wave", audioTracks[0].id));
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
  assert.match(document.body.textContent, /等待对方客户端确认/);
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

test("exchange replies while browsing, saves once and its notification opens the result", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  t.mock.method(window.HTMLMediaElement.prototype, "load", () => {});
  t.mock.method(window.HTMLMediaElement.prototype, "pause", () => {});
  window.HTMLElement.prototype.scrollTo = () => {};
  const events = [];
  recoveryTest.toasts = [];
  recoveryTest.host = {
    data: { favoriteIds: [], listenLaterIds: [], events: [], history: [], onlineExchanges: [], demoReplies: [] },
    save: async (action, trackId, id, event) => {
      if (action === "event") events.push(event);
      if (action === "queueExchange") recoveryTest.host.data.demoReplies = [{ id, trackId, kind: "exchange", event, dueAt: Date.now() + 2600, status: "pending", notified: false }];
      return true;
    },
    claimReply: async id => { const item = recoveryTest.host.data.demoReplies.find(item => item.id === id); if (item.notified) return null; item.notified = true; return { ...item }; },
  };
  await act(async () => root.render(React.createElement(ResonanceExperience, { onlinePanel: null, onlineNotice: null, onlineActive: false, onPauseOnline() {}, initialSource: "demo" })));
  const click = async label => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label || item.getAttribute("aria-label") === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => button.click());
  };
  await click(`查看 ${audioTracks[0].track}`);
  await click("丢一首歌给 TA");
  await click("匿名送出这首歌");
  await click("先去逛逛");
  await click("足迹与收藏");
  await act(async () => t.mock.timers.tick(2599));
  assert.equal(recoveryTest.toasts.length, 0);
  assert.match(document.body.textContent, /我的音乐足迹/);
  await act(async () => t.mock.timers.tick(1));
  const pendingReply = recoveryTest.host.data.demoReplies[0];
  events.push(pendingReply.event);
  recoveryTest.host.data.demoReplies = [{ ...pendingReply, status: "ready" }];
  await act(async () => root.render(React.createElement(ResonanceExperience, { onlinePanel: null, onlineNotice: null, onlineActive: false, onPauseOnline() {}, initialSource: "demo" })));
  assert.equal(events.filter(event => event.type === "exchange").length, 1);
  assert.equal(recoveryTest.toasts.length, 1);
  assert.equal(recoveryTest.toasts[0].title, "TA 回了你一首歌");
  assert.match(document.body.textContent, /我的音乐足迹/);
  await act(async () => recoveryTest.toasts[0].action.onClick());
  assert.match(document.body.textContent, /收到一首新音乐/);
  await act(async () => t.mock.timers.tick(3000));
  assert.equal(events.filter(event => event.type === "exchange").length, 1);
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
  const total = [...document.querySelectorAll('.stat-grid article')].find(item => item.textContent.includes('今日交换'));
  assert.equal(total.querySelector('strong').textContent, '3');
  assert.equal(document.querySelectorAll('.journey-event').length, 3);
});

test("incoming invitation notifies once, opens invitation and disappears when resolved", async () => {
  let opened = 0;
  function Harness({ invite }) { useIncomingInviteNotification(invite, () => opened++); return null; }
  const invite = pendingInvite();
  await act(async () => root.render(React.createElement(Harness, { invite })));
  await act(async () => root.render(React.createElement(Harness, { invite: { ...invite } })));
  assert.equal(recoveryTest.toasts.length, 1);
  assert.equal(recoveryTest.toasts[0].title, "有人邀请你一起听");
  recoveryTest.toasts[0].action.onClick(); assert.equal(opened, 1);
  await act(async () => root.render(React.createElement(Harness, { invite: null })));
  assert.ok(recoveryTest.dismissedToasts.includes(recoveryTest.toasts[0].id));
});

test("room recipient gets offer toast; sender does not; completion notifies without heartbeat duplicates", async () => {
  const offered = { id: token, from: "host", status: "pending", offeredTrackId: audioTracks[0].id, createdAt: Date.now(), expiresAt: Date.now() + 60000, saved: {host:false,guest:false} };
  function Harness({ state, role }) { useRoomExchangeNotification(state, role, true); return null; }
  await act(async () => root.render(React.createElement(Harness, { state: room({ exchange: offered }), role: "host" })));
  assert.equal(recoveryTest.toasts.length, 0);
  await act(async () => root.render(React.createElement(Harness, { state: room({ exchange: offered }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 1); assert.equal(recoveryTest.toasts[0].title, "TA 送来一首歌");
  await act(async () => root.render(React.createElement(Harness, { state: room({ revision: 2, exchange: { ...offered } }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 1);
  await act(async () => root.render(React.createElement(Harness, { state: room({ exchange: { ...offered, status: "completed", responseTrackId: audioTracks[1].id } }), role: "guest" })));
  assert.equal(recoveryTest.toasts.length, 2);
  assert.equal(recoveryTest.toasts[1].description, `《${audioTracks[0].track}》`);
  assert.ok(recoveryTest.dismissedToasts.includes(recoveryTest.toasts[0].id));
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
