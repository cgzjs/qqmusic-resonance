import type { Metadata } from "next";
import { NearbyExperience } from "@/components/resonance/NearbyExperience";
export const metadata: Metadata = { title: "附近发现 · 同频" };
export default function NearbyPage() {
  return <NearbyExperience />;
}
