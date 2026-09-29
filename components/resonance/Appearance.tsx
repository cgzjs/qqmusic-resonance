"use client";

import type { CSSProperties, ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useClientReady } from "@/hooks/useClientReady";
import { audioTracks } from "@/lib/resonance/demo-data";
import { useHost } from "./HostProvider";
import { MusicBackdrop } from "./MusicBackdrop";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="data-theme" storageKey="resonance.appearance" defaultTheme="dark" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange>{children}</ThemeProvider>;
}

/** `compact` renders the icon-only header button used on the cover-driven pages. */
export function AppearanceToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const ready = useClientReady();
  const light = ready && theme === "light";
  const label = light ? "切换为夜间外观" : "切换为日间外观";
  return <button type="button" className={compact ? "tp-icon-btn" : "appearance-toggle"} disabled={!ready} aria-label={label} title={label} onClick={() => setTheme(light ? "dark" : "light")}>
    {light ? <Sun size={compact ? 20 : 17} aria-hidden="true" /> : <Moon size={compact ? 20 : 17} aria-hidden="true" />}{!compact && <span>{light ? "日间" : "夜间"}</span>}
  </button>;
}

/** A decorative wash of the current release, independent of audio playback. */
export function MusicAtmosphere({ trackId }: { trackId?: string }) {
  const host = useHost();
  const cover = audioTracks.find(track => track.id === (trackId ?? host.trackId))?.coverUrl ?? audioTracks[0]?.coverUrl;
  return <div className="music-atmosphere" aria-hidden="true" style={{ "--atmosphere-art": cover ? `url("${cover}")` : "none" } as CSSProperties}>
    <div className="music-atmosphere-art" /><div className="music-atmosphere-contours" /><MusicBackdrop />
  </div>;
}
