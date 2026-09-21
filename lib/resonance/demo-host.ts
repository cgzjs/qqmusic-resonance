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
    if (run !== generation) return state;
    if (!config.demo) return emit({ status: "unavailable", session: null, trackId: null, error: "尚未接入 QQ 音乐宿主授权，请在已接入的宿主中打开。" });
    const selected = sessionStorage.getItem("resonance.mock-host.slot");
    if (selected !== "A" && selected !== "B") return emit({ status: "signed-out", session: null, trackId: null, error: null });
    slot = selected;
    const selectedIdentityKey = identityKey(), selectedTrackKey = trackKey();
    const loadIdentity = async (): Promise<DemoIdentity | null> => {
      if (run !== generation) return null;
      let identity: DemoIdentity | null = null;
      try { identity = JSON.parse(localStorage.getItem(selectedIdentityKey) ?? "null"); } catch { /* Recover malformed local profile data. */ }
      if (identity && (!UUID_PATTERN.test(identity.accountId ?? "") || !UUID_PATTERN.test(identity.deviceKey ?? ""))) identity = null;
      if (identity?.signedOut && !force) return null;
      if (!identity) {
        identity = await (await hostFetch("create", null, { displayName: `模拟听众 ${selected}` })).json() as DemoIdentity;
        localStorage.setItem(selectedIdentityKey, JSON.stringify(identity));
      }
      return identity;
    };
    // Tabs selecting the same local identity should not race to create two accounts.
    const identity = navigator.locks ? await navigator.locks.request(`resonance-profile-${selected}`, loadIdentity) : await loadIdentity();
    if (run !== generation) return state;
    if (!identity) return emit({ status: "signed-out", session: null, trackId: null, error: null });
    const response = await fetch("/api/host/resume", { method: "POST", headers: { "Content-Type": "application/json", "X-Account-Id": identity.accountId }, body: JSON.stringify({ deviceKey: identity.deviceKey }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("无法恢复登录状态，请稍后重试。");
    const session = await response.json() as HostSession;
    if (run !== generation) return state;
    localStorage.setItem(selectedIdentityKey, JSON.stringify({ ...identity, signedOut: false }));
    const storedTrack = localStorage.getItem(selectedTrackKey);
    const trackId = storedTrack === "none" ? null : audioTracks.find(track => track.id === storedTrack)?.id ?? audioTracks[selected === "A" ? 0 : Math.min(1, audioTracks.length - 1)]?.id ?? null;
    return emit({ status: "ready", session, trackId, error: null });
  } catch (error) {
    if (run !== generation) return state;
    return emit({ status: "unavailable", session: null, trackId: null, error: error instanceof Error && error.message.startsWith("无法") ? error.message : "暂时无法读取登录状态。请检查网络与浏览器存储权限后重试。" });
  }
}

export const demoHost: HostAdapter & { chooseAccount(): void; switchAccount(slot: "A" | "B"): Promise<HostSnapshot>; setTrack(trackId: string | null): void; logout(): Promise<void>; expire(): void } = {
  restore: () => restore(), requestAuthorization: () => restore(true),
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  chooseAccount() { sessionStorage.removeItem("resonance.mock-host.slot"); generation++; emit({ status: "signed-out", session: null, trackId: null, error: null }); },
  async switchAccount(next) { sessionStorage.setItem("resonance.mock-host.slot", next); return restore(true); },
  setTrack(trackId) {
    // Empty string represents a host without a current song.
    localStorage.setItem(trackKey(), trackId ?? "none"); emit({ ...state, trackId });
  },
  async logout() {
    const session = state.session;
    if (!session) return;
    await hostFetch("logout", session, { scope: "session" });
    if (state.session?.token !== session.token) return;
    sessionStorage.removeItem("resonance.mock-host.slot");
    generation++; emit({ status: "signed-out", session: null, trackId: null, error: null });
  },
  expire() { generation++; emit({ status: "expired", session: null, trackId: null, error: "宿主授权已失效，发现与播放已停止。" }); },
};
