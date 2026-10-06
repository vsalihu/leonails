"use client";

import { useState } from "react";

/** Click or use arrow keys to choose the part of the image that must stay visible when cropped. */
export function FocalPicker({ src, x, y, alt }: { src: string; x: number; y: number; alt: string }) {
  const [pos, setPos] = useState({ x, y });
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Crop focus point"
        aria-valuetext={`${pos.x}% across, ${pos.y}% down`}
        aria-valuenow={pos.x}
        className="relative cursor-crosshair overflow-hidden bg-cream"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
        }}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 10 : 2;
          if (e.key === "ArrowLeft") setPos((p) => ({ ...p, x: clamp(p.x - d) }));
          else if (e.key === "ArrowRight") setPos((p) => ({ ...p, x: clamp(p.x + d) }));
          else if (e.key === "ArrowUp") setPos((p) => ({ ...p, y: clamp(p.y - d) }));
          else if (e.key === "ArrowDown") setPos((p) => ({ ...p, y: clamp(p.y + d) }));
          else return;
          e.preventDefault();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block h-auto w-full" />
        <span aria-hidden className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ivory shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} />
      </div>
      <input type="hidden" name="focalX" value={pos.x} />
      <input type="hidden" name="focalY" value={pos.y} />
      <div className="mt-2 flex gap-2" aria-hidden>
        {["aspect-square", "aspect-[4/5]", "aspect-[16/9]"].map((a) => (
          <div key={a} className={`relative w-16 overflow-hidden bg-cream ${a}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${pos.x}% ${pos.y}%` }} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-taupe">Click the image to set the crop focus. Previews show square, portrait and wide crops.</p>
    </div>
  );
}
