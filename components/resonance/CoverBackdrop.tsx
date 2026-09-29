"use client";

import { useState } from "react";
import Image from "next/image";

/** Blurred artwork of the current song behind the whole page; the new cover fades in over the previous one. */
export function CoverBackdrop({ coverUrl }: { coverUrl?: string }) {
  const [layers, setLayers] = useState({ current: coverUrl, previous: undefined as string | undefined });
  if (layers.current !== coverUrl) setLayers({ current: coverUrl, previous: layers.current });
  return <div className="tp-art" aria-hidden="true">
    {layers.previous && <Image key={`previous-${layers.previous}`} src={layers.previous} alt="" fill unoptimized sizes="100vw" className="tp-art-img" />}
    {layers.current && <Image key={layers.current} src={layers.current} alt="" fill unoptimized sizes="100vw" className="tp-art-img tp-art-img--enter" />}
  </div>;
}
