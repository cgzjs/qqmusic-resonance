import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "附近发现 · 同频" };
export default async function RoomLobbyPage({ searchParams }: { searchParams: Promise<{ track?: string }> }) {
  const { track } = await searchParams;
  redirect(`/nearby${track ? `?track=${encodeURIComponent(track)}` : ""}`);
}
