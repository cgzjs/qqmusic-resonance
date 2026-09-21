import type { Metadata } from "next";
import { ListeningRoomExperience } from "@/components/resonance/ListeningRoomExperience";

export const metadata: Metadata = { title: "一起听 · 同频房间", referrer: "no-referrer" };
export default async function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <ListeningRoomExperience roomId={roomId} />;
}
