import assert from "node:assert/strict";
import { mockAccount, accountHeaders } from "./host-test-helpers.mjs";
export async function setupExchangeRoom(base, trackIds = ["demo-night", "demo-glass"]) {
  const a = await mockAccount(base), b = await mockAccount(base, "模拟听众 B");
  const nearby = async (action, account, token, body) => {
    const response = await fetch(`${base}/api/nearby/${action}`, { method: body ? "POST" : "GET", headers: { ...accountHeaders(account.session), "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${action}: ${response.status}`); return response.json();
  };
  const aPresence = await nearby("start", a, null, { trackId: trackIds[0] });
  const bPresence = await nearby("start", b, null, { trackId: trackIds[1] });
  const invite = await nearby("invite", a, aPresence.token, { targetId: bPresence.self.id });
  const accepted = await nearby("respond", b, bPresence.token, { inviteId: invite.invite.id, decision: "accept" });
  const followed = await nearby("state", a, aPresence.token);
  await nearby("stop", a, aPresence.token, {}); await nearby("stop", b, bPresence.token, {});
  return { hostAccount: b, guestAccount: a, hostTicket: accepted.ticket, guestTicket: followed.ticket };
}
export class ExchangePeer {
  events = []; latest = null; nextIndex = 0;
  constructor(base, ticket, account, clientId = crypto.randomUUID()) {
    this.clientId = clientId;
    this.socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/rooms/${ticket.roomId}/socket`);
    this.socket.addEventListener("message", event => { const message = JSON.parse(event.data); this.events.push(message); if (message.room) this.latest = message.room; });
    this.socket.addEventListener("open", () => this.send({ type: "hello", token: ticket.token, clientId, accountToken: account.session.token }));
    this.heartbeat = setInterval(() => { if (this.socket.readyState === WebSocket.OPEN) this.send({ type: "ping", sentAt: Date.now() }); }, 4000);
  }
  send(value) { this.socket.send(JSON.stringify(value)); }
  command(action, values = {}) { const message = { type: "exchange", id: crypto.randomUUID(), action, sentAt: Date.now(), ...values }; this.send(message); return message; }
  async wait(predicate, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = this.events.find(predicate); if (match) return match;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Exchange state timed out");
  }
  close() { clearInterval(this.heartbeat); this.socket.close(); }
}
export async function accountData(base, account) {
  const response = await fetch(`${base}/api/host/data`, { headers: accountHeaders(account.session) });
  assert.equal(response.status, 200); return response.json();
}
export async function waitForRecords(base, account, count = 1) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { const data = await accountData(base, account); if (data.onlineExchanges.length === count) return data; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Account exchange record not saved");
}
