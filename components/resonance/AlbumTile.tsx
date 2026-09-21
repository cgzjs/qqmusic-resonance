"use client";
import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { AudioLines } from "lucide-react";

type AlbumTileProps = {
  coverUrl?: string;
  accent: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function AlbumCover({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <Image src={src} alt="" fill unoptimized className="album-cover" onError={() => setFailed(true)} />;
}

export function AlbumTile({ accent, size = "md", className = "", coverUrl }: AlbumTileProps) {
  return (
    <div
      className={`album-tile album-tile--${size} ${className}`}
      data-has-cover={!!coverUrl}
      style={{ "--album-accent": accent } as CSSProperties}
      aria-hidden="true"
    >
      <span className="album-tile__ring" />
      <AudioLines size={size === "lg" ? 28 : 17} />
      {coverUrl && <AlbumCover key={coverUrl} src={coverUrl} />}
    </div>
  );
}
