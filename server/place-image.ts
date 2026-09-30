import type { AccountEnv } from "./host-api";

type ImageAiBinding = { run: (model: string, input: unknown) => Promise<unknown> };
type PlaceImageEnv = AccountEnv & { AI?: ImageAiBinding; AI_IMAGE_MODEL?: string; AI_IMAGE_PROVIDER?: string; TENCENT_TOKENHUB_API_KEY?: string; TENCENT_TOKENHUB_BASE_URL?: string; OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string; OPENAI_IMAGE_MODEL?: string };
const FALLBACK_IMAGE = "/assets/ambient/sound-postcard-bg.png";
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const TENCENT_MODEL = "hy-image-v3";
const TENCENT_ENDPOINT = "/v1/wand/hunyuan-image/v3-generation";
const OPENAI_MODEL = "gpt-image-2.5-flare";

function providerError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  if (/401|403|AUTH|UNAUTHORIZED/i.test(message)) return { error: "AI_AUTH_FAILED", status: 502 };
  if (/402|BILLING|QUOTA|POSTPAID/i.test(message)) return { error: "AI_BILLING_REQUIRED", status: 402 };
  if (/429|RATE/i.test(message)) return { error: "AI_RATE_LIMIT", status: 429 };
  if (/CONTENT|ILLEGAL|MODERATION/i.test(message)) return { error: "AI_CONTENT_REJECTED", status: 422 };
  if (/TIMEOUT|ABORT/i.test(message)) return { error: "AI_TIMEOUT", status: 504 };
  return { error: "AI_UNAVAILABLE", status: 503 };
}

function valid(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

export function buildPlaceImagePrompt(track: string, artist: string, title: string) {
  return [
    "一张适合手机地点留言卡片的竖版编辑插画，画面像一张有纸张纹理的声音明信片。",
    `音乐线索：歌曲《${track}》，艺人${artist}。`,
    title ? `留言标题的情绪线索：${title}。` : "",
    "主体是黄昏海边远景、低矮山脊和一条通向水面的安静小路，暖金色夕光从地平线照进画面；只用三条稀疏、开放的弧形光带从远处向前延伸，表达音乐经过这里的感觉。",
    "编辑插画、细腻纸张纹理、自然景深、清晰前中后景、克制留白、低视觉噪声；色彩使用深蓝、海玻璃青、浅灰蓝和少量暖金。",
    "不要同心圆、螺旋、靶心、重复圆环、唱片、复杂几何图案、人物、文字、歌词、地名、Logo、水印、专辑封面复刻或可识别地标。",
  ].filter(Boolean).join(" ");
}

async function tencentImage(prompt: string, env: PlaceImageEnv) {
  if (!env.TENCENT_TOKENHUB_API_KEY) return null;
  const base = (env.TENCENT_TOKENHUB_BASE_URL || "https://tokenhub.tencentmaas.com").replace(/\/$/, "");
  const response = await fetch(`${base}${TENCENT_ENDPOINT}`, { method: "POST", headers: { Authorization: `Bearer ${env.TENCENT_TOKENHUB_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: TENCENT_MODEL, prompt, size: "768x1024", revise: false, footnote: "AI生成" }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`TENCENT_IMAGE_${response.status}`);
  const result = await response.json() as { data?: Array<{ url?: unknown }> };
  const url = result.data?.[0]?.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("TENCENT_IMAGE_EMPTY");
  const image = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!image.ok) throw new Error("TENCENT_IMAGE_DOWNLOAD_FAILED");
  return new Response(image.body, { status: 200, headers: { "Content-Type": image.headers.get("Content-Type") || "image/png", "Cache-Control": "no-store" } });
}

function base64Bytes(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function openAiImage(prompt: string, env: PlaceImageEnv) {
  if (!env.OPENAI_API_KEY) return null;
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
  const response = await fetch(`${base}/v1/images/generations`, { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || OPENAI_MODEL, prompt, size: "1024x1536", quality: "low", output_format: "jpeg", output_compression: 78, moderation: "auto", n: 1 }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`OPENAI_IMAGE_${response.status}`);
  const result = await response.json() as { data?: Array<{ b64_json?: unknown; url?: unknown }> };
  const item = result.data?.[0];
  if (typeof item?.b64_json === "string") return new Response(base64Bytes(item.b64_json), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  if (typeof item?.url === "string" && /^https?:\/\//.test(item.url)) {
    const image = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
    if (!image.ok) throw new Error("OPENAI_IMAGE_DOWNLOAD_FAILED");
    return new Response(image.body, { status: 200, headers: { "Content-Type": image.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "no-store" } });
  }
  throw new Error("OPENAI_IMAGE_EMPTY");
}

export async function placeImageApi(request: Request, env: PlaceImageEnv) {
  let body: { track?: { track?: unknown; artist?: unknown }; title?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_BODY" }, { status: 400 }); }
  if (!body?.track || !valid(body.track.track, 120) || !valid(body.track.artist, 120) || (body.title !== undefined && !valid(body.title, 40))) return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  const prompt = buildPlaceImagePrompt((body.track.track as string).trim(), (body.track.artist as string).trim(), typeof body.title === "string" ? body.title.trim() : "");
  if (env.AI_IMAGE_PROVIDER === "openai") {
    try { return await openAiImage(prompt, env) || Response.json({ source: "fallback", imageUrl: FALLBACK_IMAGE }); }
    catch (error) { const failure = providerError(error); return Response.json({ error: failure.error, provider: "openai" }, { status: failure.status }); }
  }
  if (env.TENCENT_TOKENHUB_API_KEY) {
    try { return await tencentImage(prompt, env) || Response.json({ source: "fallback", imageUrl: FALLBACK_IMAGE }); }
    catch (error) { const failure = providerError(error); return Response.json({ error: failure.error, provider: "tencent" }, { status: failure.status }); }
  }
  if (!env.AI) return Response.json({ source: "fallback", imageUrl: FALLBACK_IMAGE });
  try {
    const result = await env.AI.run(env.AI_IMAGE_MODEL || DEFAULT_MODEL, { prompt });
    if (result instanceof ReadableStream) return new Response(result as ReadableStream<Uint8Array>, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch {
    // Keep the demo usable when the optional image model is unavailable.
  }
  return Response.json({ source: "fallback", imageUrl: FALLBACK_IMAGE });
}
