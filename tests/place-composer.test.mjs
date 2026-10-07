import test, { after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const installDom = dom => {
  for (const key of ["window", "document", "navigator", "sessionStorage", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLCanvasElement", "Element", "Node", "MutationObserver", "CustomEvent", "Event"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
};
const bootstrap = new JSDOM("<div />", { url: "http://localhost/" });
installDom(bootstrap);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
bootstrap.window.close();

const folder = path.resolve("node_modules/.cache/place-composer");
await mkdir(folder, { recursive: true });
const bundle = path.join(folder, `composer-${process.pid}.mjs`);
await build({
  stdin: { contents: "export { LocationMusic } from './components/resonance/LocationMusic'; export { audioTracks } from './lib/resonance/demo-data';", resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, platform: "node", format: "esm", packages: "external", outfile: bundle,
  plugins: [{ name: "composer-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(\.\/HostProvider|@\/hooks\/usePlaceMusic|@\/lib\/resonance\/demo-host)$/ }, args => ({ path: args.path, namespace: "boundary" }));
    builder.onLoad({ filter: /.*/, namespace: "boundary" }, args => ({ resolveDir: process.cwd(), contents: args.path.includes("HostProvider")
      ? "export const useHost = () => globalThis.composerTest.host;"
      : args.path.includes("usePlaceMusic") ? "export const usePlaceMusic = () => globalThis.composerTest.wall;"
      : "export const demoHost = { expire() { throw new Error('Unexpected auth expiry'); } };" }));
    builder.onResolve({ filter: /^@\/components\/ui\/dialog$/ }, () => ({ path: "dialog", namespace: "dialog" }));
    // Keep the real editor handlers and lifecycle; portal presentation is tested in-browser.
    builder.onLoad({ filter: /.*/, namespace: "dialog" }, () => ({ resolveDir: process.cwd(), contents: "import React from 'react'; const Wrapper = ({children}) => React.createElement(React.Fragment, null, children); export const Dialog=Wrapper, DialogTrigger=Wrapper, DialogClose=Wrapper, DialogContent=Wrapper, DialogTitle=Wrapper, DialogDescription=Wrapper;" }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "image" }));
    builder.onLoad({ filter: /.*/, namespace: "image" }, () => ({ resolveDir: process.cwd(), contents: "import React from 'react'; export default function Image({fill,unoptimized,priority,...props}) { return React.createElement('img',props); }" }));
  } }],
});
after(() => unlink(bundle));
const { LocationMusic, audioTracks } = await import(pathToFileURL(bundle));

// A small raster oracle for the Canvas operations used here. Assertions sample
// the resulting pixels, rather than matching the component's drawing commands.
const color = value => value.startsWith("#")
  ? [...value.slice(1).match(/../g).map(channel => parseInt(channel, 16)), 1]
  : value.match(/[\d.]+/g).map(Number);
const blend = (destination, source, operation) => {
  if (operation === "destination-out") return [...destination.slice(0, 3), destination[3] * (1 - source[3])];
  const alpha = source[3] + destination[3] * (1 - source[3]);
  return alpha ? [...[0, 1, 2].map(index => (source[index] * source[3] + destination[index] * destination[3] * (1 - source[3])) / alpha), alpha] : [0, 0, 0, 0];
};
const nearSegment = (x, y, a, b, radius) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const fraction = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - fraction * dx, y - a[1] - fraction * dy) <= radius;
};
function pixel(operations, x, y) {
  let result = [0, 0, 0, 0];
  for (const operation of operations) {
    let source;
    if (operation.kind === "image") {
      const stored = pixel(operation.snapshot.operations, x, y);
      source = operation.snapshot.jpeg ? [...stored.slice(0, 3).map(channel => channel * stored[3]), 1] : stored;
      source[3] *= operation.alpha;
    } else if (operation.kind === "fill" || operation.points.slice(1).some((point, index) => nearSegment(x, y, operation.points[index], point, operation.width / 2))) {
      source = color(operation.color); source[3] *= operation.alpha;
    }
    if (source) result = blend(result, source, operation.composite);
  }
  return result;
}
function canvasEnvironment(dom) {
  const contexts = new WeakMap(), snapshots = new Map();
  let sequence = 0;
  const context = canvas => {
    if (!contexts.has(canvas)) {
      const stack = [];
      contexts.set(canvas, {
        operations: [], points: [], globalCompositeOperation: "source-over", globalAlpha: 1, lineWidth: 1, fillStyle: "#000000", strokeStyle: "#000000",
        save() { stack.push({ globalCompositeOperation: this.globalCompositeOperation, globalAlpha: this.globalAlpha, lineWidth: this.lineWidth, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle }); },
        restore() { Object.assign(this, stack.pop()); },
        clearRect() { this.operations = []; },
        fillRect() { this.operations.push({ kind: "fill", color: this.fillStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); },
        beginPath() { this.points = []; }, moveTo(x, y) { this.points.push([x, y]); }, lineTo(x, y) { this.points.push([x, y]); },
        stroke() { this.operations.push({ kind: "stroke", points: structuredClone(this.points), color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); },
        drawImage(image) { this.operations.push({ kind: "image", snapshot: image.snapshot, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); },
      });
    }
    return contexts.get(canvas);
  };
  dom.window.HTMLCanvasElement.prototype.getContext = function () { return context(this); };
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 512, height: 512 });
  dom.window.HTMLCanvasElement.prototype.setPointerCapture = () => {};
  dom.window.HTMLCanvasElement.prototype.toDataURL = function (type) {
    const url = `data:${type};base64,${Buffer.from(String(++sequence)).toString("base64")}`;
    snapshots.set(url, { jpeg: type === "image/jpeg", operations: structuredClone(context(this).operations) });
    return url;
  };
  globalThis.Image = class {
    set src(value) { this.snapshot = snapshots.get(value); queueMicrotask(() => this.onload?.()); }
  };
  return { context };
}

let dom, root, raster, requests;
const imageUrl = "data:image/png;base64,aW1hZ2U=";
beforeEach(() => {
  dom = new JSDOM('<div id="app"></div>', { url: "http://localhost/nearby", pretendToBeVisual: true });
  installDom(dom); raster = canvasEnvironment(dom); requests = [];
  globalThis.composerTest = {
    host: { status: "ready", session: { accountId: crypto.randomUUID(), token: crypto.randomUUID(), mode: "preview", expiresAt: Date.now() + 60000 }, data: { favoriteIds: [] } },
    wall: { ready: true, busy: false, pending: null, error: null, data: { places: [], notes: [], placeId: null }, act: async () => ({ notes: [] }) },
  };
  globalThis.fetch = (url, options) => {
    assert.equal(url, "/api/ai/place-image");
    return new Promise(resolve => requests.push({ body: JSON.parse(options.body), resolve }));
  };
  root = createRoot(document.getElementById("app"));
});
afterEach(async () => {
  await act(async () => { root.unmount(); for (const request of requests) request.resolve(Response.json({ source: "ai", imageUrl })); });
  dom.window.close();
});
const props = experience => ({ experience, currentTrackId: audioTracks[0].id, onPlayTrack() {}, onPauseMusic() {} });
const mount = async (experience = "demo") => act(async () => root.render(React.createElement(LocationMusic, props(experience))));
const unmount = async () => act(async () => root.render(null));
const button = name => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === name || item.getAttribute("aria-label") === name);
const click = async name => { assert.ok(button(name), name); await act(async () => button(name).click()); };
async function input(selector, value) {
  const element = document.querySelector(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function stroke(from, to) {
  const canvas = document.querySelector("canvas");
  await act(async () => {
    for (const [type, point] of [["pointerdown", from], ["pointermove", to], ["pointerup", to]]) {
      const event = new dom.window.Event(type, { bubbles: true });
      Object.assign(event, { clientX: point[0], clientY: point[1], pointerId: 1 });
      canvas.dispatchEvent(event);
    }
  });
}
const canvasPixel = (x, y) => pixel(raster.context(document.querySelector("canvas")).operations, x, y).map(Math.round);
const completeImage = async (index = 0) => act(async () => requests[index].resolve(Response.json({ source: "ai", imageUrl })));

test("text, drawing and generated-image drafts survive format switches and view remounts", async () => {
  await mount(); await input("#place-message-title", "自己的标题"); await input("textarea", "自己写下的一句话");
  await click("画一笔"); await click("选择颜色 #d0634d"); await stroke([80, 256], [420, 256]);
  await click("AI 配图"); await click("生成图片"); await completeImage();
  await click("写一句"); assert.equal(document.querySelector("textarea").value, "自己写下的一句话");
  await click("画一笔"); assert.deepEqual(canvasPixel(120, 256), [208, 99, 77, 1]);
  await click("AI 配图"); assert.equal(document.querySelector(".tp-ai-image-preview img").getAttribute("src"), imageUrl);
  await unmount(); await mount();
  assert.equal(document.querySelector("#place-message-title").value, "自己的标题");
  assert.ok(document.querySelector(".tp-ai-image-preview img"));
  await input("#place-message-title", "生成后重新起个名字");
  assert.ok(document.querySelector(".tp-ai-image-preview img"));
  await click("写一句"); assert.equal(document.querySelector("textarea").value, "自己写下的一句话");
  await click("画一笔"); assert.deepEqual(canvasPixel(120, 256), [208, 99, 77, 1]);
});

test("a custom-title image continues offscreen and restores its song, title and running/result state", async () => {
  await mount(); await input("#place-message-title", "换个标题再画");
  await input("select[aria-label='选一首歌']", audioTracks[1].id);
  await click("AI 配图"); await click("生成图片");
  assert.equal(requests[0].body.title, "换个标题再画");
  assert.equal(requests[0].body.track.track, audioTracks[1].track);
  assert.equal(document.querySelector("#place-message-title").disabled, true);
  await unmount(); await mount();
  assert.equal(document.querySelector("#place-message-title").value, "换个标题再画");
  assert.equal(document.querySelector("select").value, audioTracks[1].id);
  assert.ok(button("生成中…")?.disabled);
  await completeImage(); assert.ok(document.querySelector(".tp-ai-image-preview img"));
  await click("换一张"); await unmount(); await completeImage(1); await mount();
  assert.ok(document.querySelector(".tp-ai-image-preview img"));
  assert.match(document.body.textContent, /AI 图已生成/); assert.equal(requests.length, 2);
});

test("drafts and late image results are isolated across accounts and experience scopes", async () => {
  const accountA = composerTest.host.session;
  await mount(); await input("#place-message-title", "A 的草稿"); await input("textarea", "A 的文字");
  await click("AI 配图"); await click("生成图片"); await unmount();
  composerTest.host.session = { ...accountA, accountId: crypto.randomUUID(), token: crypto.randomUUID() };
  await mount(); await completeImage(); await click("AI 配图");
  assert.equal(document.querySelector(".tp-ai-image-preview img"), null);
  assert.equal(document.querySelector("#place-message-title").value, "留给路过的你");
  await unmount(); composerTest.host.session = accountA; await mount("online");
  await click("AI 配图"); assert.equal(document.querySelector(".tp-ai-image-preview img"), null);
  await unmount(); await mount(); assert.ok(document.querySelector(".tp-ai-image-preview img"));
  assert.equal(document.querySelector("#place-message-title").value, "A 的草稿");
  await click("写一句"); assert.equal(document.querySelector("textarea").value, "A 的文字");
});

test("eraser removes only its stroke and undo restores the drawing without transparent/black paper", async () => {
  await mount(); await click("画一笔"); await click("选择颜色 #d0634d");
  await stroke([80, 256], [420, 256]); await click("橡皮擦"); await stroke([250, 210], [250, 300]);
  assert.deepEqual(canvasPixel(120, 256), [208, 99, 77, 1]);
  assert.deepEqual(canvasPixel(250, 256), [244, 239, 227, 1]);
  assert.deepEqual(canvasPixel(30, 30), [244, 239, 227, 1]);
  await click("撤销"); assert.deepEqual(canvasPixel(250, 256), [208, 99, 77, 1]);
  await click("写一句"); await click("画一笔"); assert.deepEqual(canvasPixel(120, 256), [208, 99, 77, 1]);
  await click("荧光笔"); await stroke([80, 100], [420, 100]); await click("清空");
  assert.deepEqual(canvasPixel(30, 30), [244, 239, 227, 1]);
});

test("failed publishing retains the drafts and only an acknowledged publish clears content and cached images", async () => {
  await mount(); await input("textarea", "送达前不能丢"); await click("画一笔"); await stroke([80, 256], [420, 256]);
  await click("AI 配图"); await click("生成图片"); await completeImage();
  composerTest.wall.act = async () => null;
  await act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  await unmount(); await mount(); assert.ok(document.querySelector(".tp-ai-image-preview img"));
  await click("写一句"); assert.equal(document.querySelector("textarea").value, "送达前不能丢");
  composerTest.wall.act = async () => ({ notes: [] });
  await act(async () => document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  await unmount(); await mount(); assert.equal(document.querySelector("textarea").value, "");
  await click("AI 配图"); assert.equal(document.querySelector(".tp-ai-image-preview img"), null);
  await click("画一笔"); assert.ok(button("清空").disabled);
  assert.deepEqual(canvasPixel(120, 256), [244, 239, 227, 1]);
});

test("a failed replacement keeps the previous generated picture and its failure remains visible after remount", async () => {
  await mount(); await click("AI 配图"); await click("生成图片"); await completeImage();
  await click("换一张");
  await act(async () => requests[1].resolve(Response.json({ error: "AI_UNAVAILABLE" }, { status: 503 })));
  assert.equal(document.querySelector(".tp-ai-image-preview img").getAttribute("src"), imageUrl);
  assert.match(document.body.textContent, /生图服务暂时不可用/);
  await unmount(); await mount();
  assert.equal(document.querySelector(".tp-ai-image-preview img").getAttribute("src"), imageUrl);
  assert.match(document.body.textContent, /生图服务暂时不可用/);
});
