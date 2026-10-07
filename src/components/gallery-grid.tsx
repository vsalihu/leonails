"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { bestVariant, mediaUrl, srcSet, type Media } from "@/lib/media";

export type GalleryEntry = Media & { category: string | null; treatment: { slug: string; name: string } | null };

export function GalleryGrid({ items, categories }: { items: GalleryEntry[]; categories: { slug: string; label: string }[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const visible = filter === "all" ? items : items.filter((i) => i.category === filter);
  const usedCategories = categories.filter((c) => items.some((i) => i.category === c.slug));
  const current = open !== null ? visible[open] : null;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (open === null) return;
    if (e.key === "ArrowRight") setOpen((open + 1) % visible.length);
    if (e.key === "ArrowLeft") setOpen((open - 1 + visible.length) % visible.length);
  }

  return (
    <>
      {usedCategories.length > 1 && (
        <div role="group" aria-label="Filter by style" className="flex flex-wrap gap-2">
          {[{ slug: "all", label: "All" }, ...usedCategories].map((c) => (
            <button
              key={c.slug}
              type="button"
              aria-pressed={filter === c.slug}
              onClick={() => setFilter(c.slug)}
              className={`btn min-h-11 px-5 ${filter === c.slug ? "btn-primary" : "btn-outline border-line-strong"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <p className="sr-only" aria-live="polite">{visible.length} images shown</p>

      {visible.length === 0 ? (
        <p className="mt-12 text-taupe">No images in this style yet.</p>
      ) : (
        <ul className="mt-10 columns-2 gap-3 md:columns-3 md:gap-4">
          {visible.map((m, i) => (
            <li key={m.id} className="mb-3 break-inside-avoid md:mb-4">
              <button
                type="button"
                className="group relative block w-full overflow-hidden bg-cream"
                style={{ aspectRatio: `${m.width} / ${m.height}` }}
                onClick={(e) => {
                  triggerRef.current = e.currentTarget;
                  setOpen(i);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- responsive variants come from the media pipeline */}
                <img
                  src={mediaUrl(m, bestVariant(m, 480))}
                  srcSet={srcSet(m)}
                  sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                  alt={m.alt}
                  width={m.width}
                  height={m.height}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.035]"
                  style={{ objectPosition: `${m.focalX}% ${m.focalY}%` }}
                  onError={(e) => ((e.currentTarget.style.visibility = "hidden"))}
                />
                {m.caption && (
                  <span className="absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-night/70 to-transparent px-3 pb-3 pt-8 text-left text-sm text-ivory opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    {m.caption}
                  </span>
                )}
                <span className="sr-only">Open image{m.caption ? `: ${m.caption}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-label="Image viewer"
        className="lightbox m-0 h-dvh max-h-none w-screen max-w-none bg-night/95 p-0 text-ivory backdrop:bg-night/80"
        onClose={() => {
          setOpen(null);
          triggerRef.current?.focus();
        }}
        onKeyDown={onKey}
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
      >
        {current && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
              <p className="text-sm text-nude" aria-live="polite">
                {(open ?? 0) + 1} of {visible.length}
              </p>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center" onClick={() => setOpen(null)} autoFocus>
                <X size={24} aria-hidden /><span className="sr-only">Close</span>
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 md:px-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.id}
                src={mediaUrl(current, bestVariant(current, 1600))}
                srcSet={srcSet(current)}
                sizes="90vw"
                alt={current.alt}
                className="lightbox-image max-h-full max-w-full object-contain"
              />
              {visible.length > 1 && (
                <>
                  <button type="button" className="absolute left-2 inline-flex h-12 w-12 items-center justify-center md:left-4" onClick={() => setOpen(((open ?? 0) - 1 + visible.length) % visible.length)}>
                    <CaretLeft size={28} aria-hidden /><span className="sr-only">Previous image</span>
                  </button>
                  <button type="button" className="absolute right-2 inline-flex h-12 w-12 items-center justify-center md:right-4" onClick={() => setOpen(((open ?? 0) + 1) % visible.length)}>
                    <CaretRight size={28} aria-hidden /><span className="sr-only">Next image</span>
                  </button>
                </>
              )}
            </div>
            <div className="min-h-16 px-4 py-4 text-center text-sm md:px-6">
              {current.caption && <p>{current.caption}</p>}
              {current.treatment && (
                <Link href={`/book?treatment=${current.treatment.slug}`} className="mt-1 inline-block text-nude underline underline-offset-4">
                  Book {current.treatment.name}
                </Link>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
