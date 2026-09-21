import type { Metadata } from "next";
import { NearbyExperience } from "@/components/resonance/NearbyExperience";
export const metadata: Metadata = { title: "附近发现 · 同频" };
export default async function NearbyPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <NearbyExperience initialSource={mode === "demo" ? "demo" : "online"} />;
}
