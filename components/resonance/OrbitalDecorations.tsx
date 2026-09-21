import Image from "next/image";

/** Solar / 480 Design (CC BY 4.0); full credits in public/assets/orbital/SOURCES.txt. */
export function OrbitalDecorations() {
  return (
    <div className="orbital-decorations" aria-hidden="true">
      <span className="orbital-piece orbital-ufo">
        <Image src="/assets/orbital/ufo.svg" width={104} height={104} alt="" draggable={false} unoptimized />
        <span className="orbital-ufo__shadow" />
      </span>
      <span className="orbital-piece orbital-notes">
        <Image src="/assets/orbital/music-notes.svg" width={46} height={46} alt="" draggable={false} unoptimized />
      </span>
      <span className="orbital-piece orbital-stars">
        <Image src="/assets/orbital/stars.svg" width={34} height={34} alt="" draggable={false} unoptimized />
      </span>
      <span className="orbital-piece orbital-stars orbital-stars--small">
        <Image src="/assets/orbital/stars.svg" width={20} height={20} alt="" draggable={false} unoptimized />
      </span>
    </div>
  );
}
