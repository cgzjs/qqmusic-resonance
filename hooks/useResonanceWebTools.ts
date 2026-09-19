"use client";

import { useEffect } from "react";

import { nearbyListeners } from "@/lib/resonance/demo-data";
import type { AppView, NearbyListener } from "@/lib/resonance/types";

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
  selectListener: (listener: NearbyListener) => void;
  setView: (view: AppView) => void;
};

export function useResonanceWebTools({ selectListener, setView }: WebToolActions) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();

    const tools: RegisteredTool[] = [
      {
        name: "open_nearby_match",
        title: "打开附近音乐匹配",
        description: "选择一个附近的匿名听众，并在页面中打开对应的同频详情。",
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
          selectListener(listener);
          setView("match");
          return { listenerId: listener.id, track: listener.track, view: "match" };
        },
      },
      {
        name: "open_music_journey",
        title: "打开今日音乐足迹",
        description: "在页面中打开今天的音乐相遇和统计摘要。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() {
          setView("journey");
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
  }, [selectListener, setView]);
}
