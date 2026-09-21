// Runs the actual production bundle with a test-only account-write fault proxy.
// No fault endpoint or mock failure switch is added to the application Worker.
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { Miniflare } from "miniflare";
import { setupExchangeRoom, ExchangePeer, accountData, waitForRecords } from "./exchange-test-helpers.mjs";

const server = resolve("dist/server");
const fixture = `
import worker, { ListeningRoom, PluginAccount, NearbyArea } from './index.js';
import { DurableObject } from 'cloudflare:workers';
export { PluginAccount, NearbyArea };
export class FaultGate extends DurableObject {
  async fetch(request) {
    if (request.method === 'POST') await this.ctx.storage.put('config', await request.json());
    return Response.json(await this.ctx.storage.get('config') ?? {});
  }
}
export class TestListeningRoom extends ListeningRoom {
  constructor(ctx, env) {
    const accounts = env.ACCOUNTS;
    super(ctx, { ...env, ACCOUNTS: {
      idFromName: name => accounts.idFromName(name),
      get: id => ({ fetch: async request => {
        if (new URL(request.url).pathname === '/record-exchange') {
          const gate = await env.FAULT.get(env.FAULT.idFromName('fault')).fetch('https://fault.internal/');
          const config = await gate.json();
          const body = await request.clone().json();
          if (config.blockedAccount === body.accountId) return new Response('Temporary write failure', { status: 503 });
        }
        return accounts.get(id).fetch(request);
      } })
    } });
  }
}
export default { fetch(request, env, ctx) {
  if (new URL(request.url).pathname === '/_test/fault') return env.FAULT.get(env.FAULT.idFromName('fault')).fetch(request);
  return worker.fetch(request, env, ctx);
} };
`;

test("completed exchanges survive partial account failure, room closure and Worker restart", { timeout: 60000 }, async () => {
  const persist = mkdtempSync(resolve(tmpdir(), "resonance-exchange-durability-"));
  const files = readdirSync(server, { recursive: true }).filter(path => path.endsWith(".js"));
  const options = {
    name: "exchange-durability-test", host: "127.0.0.1", port: 0,
    modules: [{ type: "ESModule", path: resolve(server, "exchange-test-entry.js"), contents: fixture }, ...files.map(path => ({ type: "ESModule", path: resolve(server, path) }))],
    modulesRoot: server, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    bindings: { DEMO_HOST_ENABLED: "true" }, durableObjectsPersist: persist,
    assets: { directory: resolve("dist/client"), binding: "ASSETS", routerConfig: { has_user_worker: true } },
    durableObjects: { ROOMS: { className: "TestListeningRoom", useSQLite: true }, ACCOUNTS: { className: "PluginAccount", useSQLite: true }, NEARBY: { className: "NearbyArea", useSQLite: true }, FAULT: { className: "FaultGate", useSQLite: true } },
  };
  let runtime = new Miniflare(options), host, guest;
  try {
    let base = String(await runtime.ready).replace(/\/$/, "");
    const setup = await setupExchangeRoom(base);
    const fault = await fetch(`${base}/_test/fault`, { method: "POST", body: JSON.stringify({ blockedAccount: setup.guestAccount.session.accountId }) });
    assert.equal(fault.status, 200);
    host = new ExchangePeer(base, setup.hostTicket, setup.hostAccount); guest = new ExchangePeer(base, setup.guestTicket, setup.guestAccount);
    await host.wait(event => event.room?.hostConnected && event.room.guestConnected); await guest.wait(event => event.type === "welcome");
    const offer = host.command("offer", { trackId: "demo-night" }); await host.wait(event => event.requestId === offer.id);
    const response = guest.command("respond", { exchangeId: offer.id, trackId: "demo-glass" });
    await guest.wait(event => event.requestId === response.id);
    const partial = await host.wait(event => event.room?.exchange?.saved.host && !event.room.exchange.saved.guest);
    assert.equal(partial.room.exchange.status, "completed");
    assert.equal((await accountData(base, setup.guestAccount)).onlineExchanges.length, 0);
    host.send({ type: "leave" }); await guest.wait(event => event.room?.closed);
    host.close(); guest.close();
    await runtime.dispose();
    runtime = new Miniflare(options);
    base = String(await runtime.ready).replace(/\/$/, "");
    assert.equal((await fetch(`${base}/api/rooms/${setup.hostTicket.roomId}/status`)).status, 404);
    const recovered = await fetch(`${base}/_test/fault`, { method: "POST", body: "{}" }); assert.equal(recovered.status, 200);
    const [hostData, guestData] = await Promise.all([waitForRecords(base, setup.hostAccount), waitForRecords(base, setup.guestAccount)]);
    assert.equal(hostData.onlineExchanges[0].id, offer.id); assert.equal(guestData.onlineExchanges[0].id, offer.id);
    assert.equal(hostData.onlineExchanges[0].receivedTrackId, "demo-glass");
    assert.equal(guestData.onlineExchanges[0].receivedTrackId, "demo-night");
    assert.equal(hostData.onlineExchanges.length, 1); assert.equal(guestData.onlineExchanges.length, 1);
  } finally { host?.close(); guest?.close(); await runtime.dispose(); }
});
