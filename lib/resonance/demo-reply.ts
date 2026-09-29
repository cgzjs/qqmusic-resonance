import type { JourneyEvent } from "./types";

export type DemoReply = {
  id: string;
  /** "wave" 只出现在旧数据里，现在只发“喜欢”。 */
  kind: "exchange" | "wave" | "heart";
  trackId: string;
  dueAt: number;
  status: "pending" | "ready";
  notified: boolean;
  event?: JourneyEvent;
};
