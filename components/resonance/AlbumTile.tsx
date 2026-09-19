import type { CSSProperties } from "react";
import { AudioLines } from "lucide-react";

type AlbumTileProps = {
  accent: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function AlbumTile({ accent, size = "md", className = "" }: AlbumTileProps) {
  return (
    <div
      className={`album-tile album-tile--${size} ${className}`}
      style={{ "--album-accent": accent } as CSSProperties}
      aria-hidden="true"
    >
      <span className="album-tile__ring" />
      <AudioLines size={size === "lg" ? 28 : 17} />
    </div>
  );
}
