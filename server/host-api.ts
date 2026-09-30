import { UUID_PATTERN } from "../lib/resonance/room-protocol";
import { accountObjectName, type AccountScope } from "./account-scope";

export type AccountEnv = { ACCOUNTS: DurableObjectNamespace; DEMO_HOST_ENABLED?: string; PUBLIC_DEMO_ORIGIN?: string; AI?: { run: (model: string, input: unknown) => Promise<unknown> }; AI_MODEL?: string; AI_IMAGE_MODEL?: string; AI_IMAGE_PROVIDER?: string; TENCENT_TOKENHUB_API_KEY?: string; TENCENT_TOKENHUB_BASE_URL?: string; OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string; OPENAI_IMAGE_MODEL?: string };
export function demoHostEnabled(request: Request, env: AccountEnv) {
  return env.DEMO_HOST_ENABLED === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}
export function hostAccountScope(request: Request, env: AccountEnv): AccountScope | null {
  if (demoHostEnabled(request, env)) return "demo";
  if (!env.PUBLIC_DEMO_ORIGIN) return null;
  try {
    const allowed = new URL(env.PUBLIC_DEMO_ORIGIN);
    const localHttp = allowed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname);
    if ((allowed.protocol !== "https:" && !localHttp) || allowed.username || allowed.password || allowed.pathname !== "/" || allowed.search || allowed.hash) return null;
    return new URL(request.url).origin === allowed.origin ? "preview" : null;
  } catch { return null; }
}
export async function verifyAccount(request: Request, env: AccountEnv) {
  const scope = hostAccountScope(request, env);
  if (!scope) return false;
  const accountId = request.headers.get("X-Account-Id") ?? "";
  if (!UUID_PATTERN.test(accountId)) return false;
  return (await env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountObjectName(accountId, scope))).fetch(new Request("https://account.internal/auth", { headers: request.headers }))).ok;
}
export async function hostApi(request: Request, env: AccountEnv) {
  const url = new URL(request.url);
  const reply = (error: string, status: number) => Response.json({ error }, { status });
  const action = url.pathname.split("/").pop();
  const scope = hostAccountScope(request, env);
  if (action === "config" && request.method === "GET") return Response.json({ demo: scope === "demo", preview: scope === "preview", realHostConfigured: false }, { headers: { "Cache-Control": "no-store" } });
  // 不接收未经验证的 QQ 身份。本机联调限 localhost；参赛体验只接受显式配置的精确 origin。
  if (!scope) return reply("HOST_NOT_CONFIGURED", 503);
  if (action === "create" && request.method === "POST") {
    const body = await request.json<{ displayName?: unknown }>();
    if (!body || !["模拟听众 A", "模拟听众 B"].includes(body.displayName as string)) return reply("INVALID_PROFILE", 400);
    if (scope === "preview") {
      const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
      const key = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
      const limit = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`preview-rate:${key}`)).fetch(new Request("https://account.internal/preview-rate", { method: "POST", body: "{}" }));
      if (!limit.ok) return new Response(limit.body, { status: limit.status, headers: limit.headers });
    }
    const accountId = crypto.randomUUID();
    return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountObjectName(accountId, scope))).fetch(new Request("https://account.internal/init", { method: "POST", body: JSON.stringify({ accountId, displayName: body.displayName, mode: scope }) }));
  }
  if (!["resume", "logout", "data"].includes(action ?? "")) return reply("NOT_FOUND", 404);
  if ((action !== "data" && request.method !== "POST") || (action === "data" && !["GET", "POST"].includes(request.method))) return reply("METHOD_NOT_ALLOWED", 405);
  const accountId = request.headers.get("X-Account-Id") ?? "";
  if (!UUID_PATTERN.test(accountId)) return reply("AUTH_REQUIRED", 401);
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountObjectName(accountId, scope))).fetch(request);
}
