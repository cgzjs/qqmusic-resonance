import test from "node:test";
import assert from "node:assert/strict";
import { buildPlaceImagePrompt, placeImageApi } from "../server/place-image.ts";

test("place image prompt is grounded in song context without precise location or user data", () => {
  const prompt = buildPlaceImagePrompt("又三郎", "ヨルシカ", "留给路过的你");
  assert.match(prompt, /又三郎/);
  assert.match(prompt, /ヨルシカ/);
  assert.match(prompt, /声音明信片/);
  assert.match(prompt, /人物、文字、歌词/);
  assert.match(prompt, /不要同心圆、螺旋/);
  assert.doesNotMatch(prompt, /28\.214|112\.971|account|token/i);
});

const imageRequest = () => new Request("https://app.example.test/api/ai/place-image", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ track: { track: "测试歌曲", artist: "测试艺人" }, title: "留给路过的你" }),
});

test("missing image configuration fails explicitly without a fixed image or network request", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("Missing credentials must not contact a provider"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await placeImageApi(imageRequest(), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI_NOT_CONFIGURED" });
});

test("an explicitly selected provider cannot silently switch when its credentials are absent", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail("The selected provider must not be replaced"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const openai = await placeImageApi(imageRequest(), { AI_IMAGE_PROVIDER: "openai", TENCENT_TOKENHUB_API_KEY: "test-key" });
  assert.equal(openai.status, 503);
  assert.deepEqual(await openai.json(), { error: "AI_NOT_CONFIGURED" });
  const tencent = await placeImageApi(imageRequest(), { AI_IMAGE_PROVIDER: "tencent", AI: { run: async () => { assert.fail("Cloudflare must not replace Tencent"); } } });
  assert.equal(tencent.status, 503);
  assert.deepEqual(await tencent.json(), { error: "AI_NOT_CONFIGURED" });
});

test("Tencent generation returns downloaded image bytes and sends the grounded prompt", async t => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return Response.json({ data: [{ url: "https://images.example.test/generated.png" }] });
    return new Response(bytes, { headers: { "Content-Type": "image/png" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await placeImageApi(imageRequest(), { AI_IMAGE_PROVIDER: "tencent", TENCENT_TOKENHUB_API_KEY: "test-key", TENCENT_TOKENHUB_BASE_URL: "https://provider.example.test" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://provider.example.test/v1/wand/hunyuan-image/v3-generation");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, "hy-image-v3");
  assert.equal(payload.revise, false);
  assert.match(payload.prompt, /测试歌曲/);
  assert.doesNotMatch(payload.prompt, /account|token|latitude|longitude/i);
  assert.equal(calls[1].url, "https://images.example.test/generated.png");
});

test("provider authentication failures remain failures rather than placeholder successes", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await placeImageApi(imageRequest(), { TENCENT_TOKENHUB_API_KEY: "test-key" });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "AI_AUTH_FAILED", provider: "tencent" });
});

test("Cloudflare errors and unsupported outputs never return a fixed fallback image", async () => {
  const failed = await placeImageApi(imageRequest(), { AI: { run: async () => { throw new Error("AI_TIMEOUT"); } } });
  assert.equal(failed.status, 504);
  assert.deepEqual(await failed.json(), { error: "AI_TIMEOUT", provider: "cloudflare" });
  const empty = await placeImageApi(imageRequest(), { AI: { run: async () => ({}) } });
  assert.equal(empty.status, 503);
  assert.deepEqual(await empty.json(), { error: "AI_UNAVAILABLE", provider: "cloudflare" });
});
