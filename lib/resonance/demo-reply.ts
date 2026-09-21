import type { JourneyEvent } from "./types";

export type DemoReply = {
  id: string;
  kind: "exchange" | "wave" | "heart";
  trackId: string;
  dueAt: number;
  status: "pending" | "ready";
  notified: boolean;
  event?: JourneyEvent;
};
