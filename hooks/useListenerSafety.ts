"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "@/components/resonance/HostProvider";
import { accountHeaders } from "@/lib/resonance/host-protocol";
import { demoHost } from "@/lib/resonance/demo-host";
import type { BlockedListener } from "@/lib/resonance/nearby-protocol";

export function useListenerSafety() {
  const { session } = useHost();
  const owner = session?.token ?? "";
  const inFlight = useRef<AbortController | null>(null);
  const [state, setState] = useState({ owner: "", busy: false, error: "" });
  useEffect(() => () => { const controller = inFlight.current; inFlight.current = null; controller?.abort(); }, [owner]);
  const run = useCallback(async (action: "blocks" | "block" | "unblock", body?: object) => {
    if (!session || inFlight.current) return null;
    const controller = new AbortController();
    inFlight.current = controller;
    const deadline = setTimeout(() => controller.abort(), 8000);
    setState({ owner, busy: true, error: "" });
    try {
      const response = await fetch(`/api/nearby/${action}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { ...accountHeaders(session), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
      const result = await response.json() as { blocks: BlockedListener[]; closing?: boolean; error?: string };
      if (inFlight.current !== controller) return null;
      if (!response.ok) {
        if (response.status === 401) demoHost.expire();
        throw new Error(result.error === "BLOCK_LIMIT" ? "最多屏蔽 100 人" : result.error === "UNAVAILABLE" ? "TA 已离开" : response.status === 401 ? "登录已过期，请重新登录。" : "操作失败，请重试");
      }
      setState({ owner, busy: false, error: "" });
      return result;
    } catch (reason) {
      if (inFlight.current === controller) setState({ owner, busy: false, error: reason instanceof Error && !["AbortError", "TypeError"].includes(reason.name) ? reason.message : action === "blocks" ? "加载失败，请重试" : "结果未确认，请重试" });
      return null;
    } finally {
      clearTimeout(deadline);
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [session, owner]);
  return { run, busy: state.owner === owner && state.busy, error: state.owner === owner ? state.error : "" };
}
