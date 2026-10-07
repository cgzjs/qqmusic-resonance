import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./appearance.css";
import "./mobile-music.css";
import "./cover.css";
import { HostProvider } from "@/components/resonance/HostProvider";
import { AppearanceProvider } from "@/components/resonance/Appearance";

export const metadata: Metadata = {
  title: "同频 · QQ音乐概念设计",
  description: "发现附近的音乐，和此刻的人一起听，用文字、手绘或 AI 配图给后来的人留一首歌。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body><AppearanceProvider><HostProvider>{children}</HostProvider></AppearanceProvider></body>
    </html>
  );
}
