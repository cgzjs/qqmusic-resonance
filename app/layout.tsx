import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./appearance.css";
import { HostProvider } from "@/components/resonance/HostProvider";
import { AppearanceProvider } from "@/components/resonance/Appearance";

export const metadata: Metadata = {
  title: "同频 · QQ音乐概念设计",
  description: "在通勤途中，与附近的人匿名跟听、交换一首歌。",
  other: {
    "codex-preview": "development",
  },
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
