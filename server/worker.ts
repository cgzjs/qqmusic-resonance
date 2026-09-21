import handler from "vinext/server/fetch-handler";
import { UUID_PATTERN } from "../lib/resonance/room-protocol";
import { audioTracks } from "../lib/resonance/demo-data";
import { hostApi, verifyAccount, type AccountEnv } from "./host-api";
export { PluginAccount } from "./plugin-account";
export { ListeningRoom } from "./listening-room";
export { NearbyArea } from "./nearby-area";

export type RoomEnv = AccountEnv & { ROOMS: DurableObjectNamespace; NEARBY: DurableObjectNamespace };

const worker = {
  async fetch(request: Request, env: RoomEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/nearby/") || url.pathname.startsWith("/api/host/")) {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
      if (!/^\/api\/(nearby\/(start|state|invite|respond|stop|track)|host\/(config|create|resume|logout|data))$/.test(url.pathname)) return new Response(null, { status: 404 });
      if (request.method === "POST") {
        if (!request.headers.get("Content-Type")?.startsWith("application/json")) return new Response(null, { status: 415 });
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024) { await reader.cancel(); return new Response(null, { status: 413 }); }
          chunks.push(value);
        }
        const body = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
        request = new Request(request.url, { method: "POST", headers: request.headers, body });
      }
      if (url.pathname.startsWith("/api/host/")) {
        try {
          const response = await hostApi(request, env);
          if (url.pathname.endsWith("/logout") && response.ok) await env.NEARBY.get(env.NEARBY.idFromName("demo-area-v1")).fetch(new Request("https://nearby.internal/revoke", { method: "POST", body: JSON.stringify({ accountId: request.headers.get("X-Account-Id") }) }));
          return response;
        } catch { return Response.json({ error: "INVALID_BODY" }, { status: 400 }); }
      }
      if (!await verifyAccount(request, env)) return Response.json({ error: "AUTH_EXPIRED" }, { status: 401 });
      return env.NEARBY.get(env.NEARBY.idFromName("demo-area-v1")).fetch(request);
    }
    if (!url.pathname.startsWith("/api/rooms")) return handler.fetch(request, env, ctx);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { Allow: "POST" } });
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) return Response.json({ error: "INVALID_BODY" }, { status: 415 });
      const reader = request.body?.getReader();
      let text = "", size = 0;
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { text += decoder.decode(); break; }
          size += value.byteLength;
          if (size > 1024) { await reader.cancel(); return Response.json({ error: "BODY_TOO_LARGE" }, { status: 413 }); }
          text += decoder.decode(value, { stream: true });
        }
      }
      let body: { trackId?: string };
      try { body = JSON.parse(text); } catch { return Response.json({ error: "INVALID_BODY" }, { status: 400 }); }
      if (!body || !audioTracks.some(track => track.id === body.trackId)) return Response.json({ error: "INVALID_TRACK" }, { status: 400 });
      const id = crypto.randomUUID();
      return env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(new Request("https://room.internal/init", { method: "POST", body: JSON.stringify({ id, trackId: body.trackId }) }));
    }
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(socket|status)$/);
    if (!match || !UUID_PATTERN.test(match[1])) return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });
    if (request.method !== "GET" || (match[2] === "socket" && request.headers.get("Upgrade")?.toLowerCase() !== "websocket")) return Response.json({ error: "WEBSOCKET_REQUIRED" }, { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
};

export default worker;
