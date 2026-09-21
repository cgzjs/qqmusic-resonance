"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { demoHost, hostFetch } from "@/lib/resonance/demo-host";
import { emptyAccountData, type AccountData, type AccountAction, type HostSnapshot } from "@/lib/resonance/host-protocol";
import type { JourneyEvent } from "@/lib/resonance/types";

type HostContextValue = HostSnapshot & { data: AccountData; dataLoading: boolean; dataError: string | null; save: (action: AccountAction, trackId: string, id?: string, event?: JourneyEvent) => Promise<boolean>; refreshData: () => void };
const HostContext = createContext<HostContextValue | null>(null);
export function HostProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HostSnapshot>({ status: "loading", session: null, trackId: null, error: null });
  const [data, setData] = useState<AccountData>(emptyAccountData);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const active = useRef(host.session);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const requestSequence = useRef(0);
  const mutations = useRef(0);

  useEffect(() => {
    const unsubscribe = demoHost.subscribe(next => {
      if (next.session?.token !== active.current?.token) {
        const previous = active.current;
        if (previous) try {
          for (const key of Object.keys(sessionStorage)) if (key.startsWith(`resonance.nearby-room.${previous.accountId}.`)) sessionStorage.removeItem(key);
        } catch { /* In-memory state still clears if browser storage is unavailable. */ }
        active.current = next.session; requestSequence.current++;
        setData(emptyAccountData); setDataError(null); setDataLoading(!!next.session);
      }
      setHost(next);
    });
    void demoHost.restore();
    return unsubscribe;
  }, []);

  const refreshData = useCallback(() => {
    const session = active.current;
    if (!session || mutations.current) return;
    const sequence = ++requestSequence.current;
    void hostFetch("data", session).then(response => response.json() as Promise<AccountData>).then(next => {
      if (active.current?.token === session.token && sequence === requestSequence.current) { setData(next); setDataError(null); setDataLoading(false); }
    }).catch(error => {
      if (active.current?.token !== session.token || sequence !== requestSequence.current) return;
      setDataLoading(false);
      if (error.message === "AUTH_EXPIRED") demoHost.expire();
      else setDataError("账号数据暂时无法读取，请重试。");
    });
  }, []);
  useEffect(() => {
    if (!host.session) return;
    const start = setTimeout(refreshData, 0);
    const interval = setInterval(refreshData, 10_000);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [host.session, refreshData]);

  const save = useCallback((action: AccountAction, trackId: string, id?: string, event?: JourneyEvent) => {
    const session = active.current;
    if (!session) return Promise.resolve(false);
    mutations.current++;
    const job = queue.current.then(async () => {
      if (active.current?.token !== session.token) return false;
      const sequence = ++requestSequence.current;
      try {
        const response = await hostFetch("data", session, { action, trackId, ...(id ? { id } : {}), ...(event ? { event } : {}) });
        const next = await response.json() as AccountData;
        if (active.current?.token === session.token && sequence === requestSequence.current) { setData(next); setDataError(null); return true; }
      } catch (error) {
        if (active.current?.token !== session.token) return false;
        if (error instanceof Error && error.message === "AUTH_EXPIRED") demoHost.expire();
        else setDataError("未保存成功，请稍后重试。");
      }
      return false;
    });
    const settled = job.finally(() => { mutations.current--; });
    queue.current = settled; return settled;
  }, []);
  return <HostContext.Provider value={{ ...host, data, dataLoading, dataError, save, refreshData }}>{children}</HostContext.Provider>;
}
export function useHost() {
  const context = useContext(HostContext);
  if (!context) throw new Error("HostProvider is required");
  return context;
}
