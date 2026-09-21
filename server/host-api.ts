import { UUID_PATTERN } from "../lib/resonance/room-protocol";

export type AccountEnv = { ACCOUNTS: DurableObjectNamespace; DEMO_HOST_ENABLED?: string };
export function demoHostEnabled(request: Request, env: AccountEnv) {
  return env.DEMO_HOST_ENABLED === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}
export async function verifyAccount(request: Request, env: AccountEnv) {
  if (!demoHostEnabled(request, env)) return false;
  const accountId = request.headers.get("X-Account-Id") ?? "";
  if (!UUID_PATTERN.test(accountId)) return false;
  return (await env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountId)).fetch(new Request("https://account.internal/auth", { headers: request.headers }))).ok;
}
export async function hostApi(request: Request, env: AccountEnv) {
  const url = new URL(request.url);
  const reply = (error: string, status: number) => Response.json({ error }, { status });
  const action = url.pathname.split("/").pop();
  if (action === "config" && request.method === "GET") return Response.json({ demo: demoHostEnabled(request, env), realHostConfigured: false }, { headers: { "Cache-Control": "no-store" } });
  // No unverified real identity is accepted. Demo provisioning is localhost-only,
  // explicitly enabled in dev and disabled in the generated production config.
  if (!demoHostEnabled(request, env)) return reply("HOST_NOT_CONFIGURED", 503);
  if (action === "create" && request.method === "POST") {
    const body = await request.json<{ displayName?: unknown }>();
    if (!body || !["模拟听众 A", "模拟听众 B"].includes(body.displayName as string)) return reply("INVALID_PROFILE", 400);
    const accountId = crypto.randomUUID();
    return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountId)).fetch(new Request("https://account.internal/init", { method: "POST", body: JSON.stringify({ accountId, displayName: body.displayName }) }));
  }
  if (!["resume", "logout", "data"].includes(action ?? "")) return reply("NOT_FOUND", 404);
  if ((action !== "data" && request.method !== "POST") || (action === "data" && !["GET", "POST"].includes(request.method))) return reply("METHOD_NOT_ALLOWED", 405);
  const accountId = request.headers.get("X-Account-Id") ?? "";
  if (!UUID_PATTERN.test(accountId)) return reply("AUTH_REQUIRED", 401);
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(accountId)).fetch(request);
}
