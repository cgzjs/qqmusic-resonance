import { accountHeaders, type HostAdapter, type HostSession, type HostSnapshot } from "./host-protocol";
import { UUID_PATTERN } from "./room-protocol";
import { audioTracks } from "./catalog";

type DemoIdentity = { accountId: string; deviceKey: string; signedOut?: boolean };
const listeners = new Set<(state: HostSnapshot) => void>();
let state: HostSnapshot = { status: "loading", session: null, trackId: null, error: null };
let slot: "A" | "B" = "A";
let generation = 0;
const identityKey = () => `resonance.mock-host.identity.${slot}`;
const trackKey = () => `resonance.mock-host.track.${slot}`;
const emit = (next: HostSnapshot) => { state = next; listeners.forEach(listener => listener(next)); return next; };

export async function hostFetch(path: string, session: HostSession | null, body?: object) {
  const response = await fetch(`/api/host/${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(session ? accountHeaders(session) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (response.status === 401) throw new Error("AUTH_EXPIRED");
  if (!response.ok) throw new Error("HOST_REQUEST_FAILED");
  return response;
}

async function restore(force = false): Promise<HostSnapshot> {
  const run = ++generation;
  emit({ ...state, status: "loading", session: null, error: null });
  try {
    const config = await (await hostFetch("config", null)).json() as { demo: boolean };
    if (!config.demo) return emit({ status: "unavailable", session: null, trackId: null, error: "尚未接入 QQ 音乐宿主授权，请在已接入的宿主中打开。" });
    slot = sessionStorage.getItem("resonance.mock-host.slot") === "B" ? "B" : "A";
    let identity: DemoIdentity | null = null;
    try { identity = JSON.parse(localStorage.getItem(identityKey()) ?? "null"); } catch { /* Invalid demo cache is not real host authorization. */ }
    if (identity && (!UUID_PATTERN.test(identity.accountId ?? "") || !UUID_PATTERN.test(identity.deviceKey ?? ""))) identity = null;
    if (identity?.signedOut && !force) return emit({ status: "signed-out", session: null, trackId: null, error: null });
    if (!identity) {
      identity = await (await hostFetch("create", null, { displayName: `模拟听众 ${slot}` })).json() as DemoIdentity;
      localStorage.setItem(identityKey(), JSON.stringify(identity));
    }
    const response = await fetch("/api/host/resume", { method: "POST", headers: { "Content-Type": "application/json", "X-Account-Id": identity.accountId }, body: JSON.stringify({ deviceKey: identity.deviceKey }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("无法恢复模拟宿主授权，请检查本地服务。");
    const session = await response.json() as HostSession;
    if (run !== generation) return state;
    localStorage.setItem(identityKey(), JSON.stringify({ ...identity, signedOut: false }));
    const storedTrack = localStorage.getItem(trackKey());
    const trackId = storedTrack === "none" ? null : audioTracks.find(track => track.id === storedTrack)?.id ?? audioTracks[slot === "A" ? 0 : Math.min(1, audioTracks.length - 1)]?.id ?? null;
    return emit({ status: "ready", session, trackId, error: null });
  } catch (error) {
    if (run !== generation) return state;
    return emit({ status: "unavailable", session: null, trackId: null, error: error instanceof Error && error.message.startsWith("无法") ? error.message : "暂时无法读取模拟宿主。请检查网络与浏览器存储权限后重试。" });
  }
}

export const demoHost: HostAdapter & { switchAccount(slot: "A" | "B"): Promise<HostSnapshot>; setTrack(trackId: string | null): void; logout(): Promise<void>; expire(): void } = {
  restore: () => restore(), requestAuthorization: () => restore(true),
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async switchAccount(next) { sessionStorage.setItem("resonance.mock-host.slot", next); return restore(); },
  setTrack(trackId) {
    // Empty string represents a host without a current song.
    localStorage.setItem(trackKey(), trackId ?? "none"); emit({ ...state, trackId });
  },
  async logout() {
    const session = state.session;
    if (!session) return;
    await hostFetch("logout", session, {});
    const identity = JSON.parse(localStorage.getItem(identityKey()) ?? "null") as DemoIdentity | null;
    if (identity) localStorage.setItem(identityKey(), JSON.stringify({ ...identity, signedOut: true }));
    generation++; emit({ status: "signed-out", session: null, trackId: null, error: null });
  },
  expire() { generation++; emit({ status: "expired", session: null, trackId: null, error: "宿主授权已失效，发现与播放已停止。" }); },
};
