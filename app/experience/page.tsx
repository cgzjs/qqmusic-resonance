import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "开始同频 · QQ音乐概念设计",
};

export default function ExperiencePage() {
  redirect("/nearby");
}
