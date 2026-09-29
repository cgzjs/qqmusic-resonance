"use client";

import { useEffect, useRef } from "react";

import { playableListeners as nearbyListeners } from "@/lib/resonance/demo-data";

type RegisteredTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};

type ModelContext = {
  registerTool: (tool: RegisteredTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

type WebToolActions = {
  /** 跟一位模拟听众一起听；正在一起听时返回 false。 */
  followListener: (listenerId: string) => boolean;
  openJourney: () => boolean;
};

export function useResonanceWebTools({ followListener, openJourney }: WebToolActions) {
  const actions = useRef({ followListener, openJourney });
  useEffect(() => { actions.current = { followListener, openJourney }; }, [followListener, openJourney]);
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    const tools: RegisteredTool[] = [
      {
        name: "listen_with_demo_listener",
        title: "和模拟听众一起听",
        description: "选择一位模拟听众，进入一起听；只用于演示，不会联系真实用户。",
        inputSchema: {
          type: "object",
          properties: {
            listenerId: {
              type: "string",
              enum: nearbyListeners.map((listener) => listener.id),
            },
          },
          required: ["listenerId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const listenerId = (input as { listenerId?: unknown })?.listenerId;
          const listener = nearbyListeners.find((item) => item.id === listenerId);
          if (!listener) throw new Error("Unknown listenerId");
          if (!actions.current.followListener(listener.id)) throw new Error("Already listening together");
          return { listenerId: listener.id, track: listener.track, view: "listening" };
        },
      },
      {
        name: "open_music_journey",
        title: "打开今日音乐足迹",
        description: "在页面中打开今天的音乐相遇和统计摘要。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          if (!actions.current.openJourney()) throw new Error("Leave the listening session first");
          return { view: "journey" };
        },
      },
    ];

    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // WebMCP is optional; the visible interface remains fully functional.
      }
    }

    return () => lifecycle.abort();
  }, []);
}
