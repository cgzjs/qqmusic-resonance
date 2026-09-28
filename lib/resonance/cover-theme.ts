import type { CSSProperties } from "react";
import type { AudioTrack } from "./types";

/**
 * Exposes both appearances of the cover palette as CSS variables; `.cover-scope`
 * in app/cover.css picks the pair that matches the active theme.
 */
export function coverThemeStyle(track?: Pick<AudioTrack, "palette">): CSSProperties {
  const palette = track?.palette;
  if (!palette) return {};
  return {
    "--cover-dark-base": palette.dark.base,
    "--cover-dark-accent": palette.dark.accent,
    "--cover-dark-ink": palette.dark.ink,
    "--cover-light-base": palette.light.base,
    "--cover-light-accent": palette.light.accent,
    "--cover-light-ink": palette.light.ink,
  } as CSSProperties;
}
