import type { Metadata } from "next";
import { GalleryGrid } from "@/components/gallery-grid";
import { GALLERY_CATEGORIES, galleryItems } from "@/lib/server/public-content";

export const metadata: Metadata = { title: "Gallery", description: "French, nude, nail art and occasion nails." };

export default async function GalleryPage() {
  const items = await galleryItems();
  const hasExamples = items.some((i) => i.isExample);
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-20">
      <h1 className="display text-5xl md:text-7xl">Gallery</h1>
      {hasExamples && <p className="mt-4 max-w-xl text-sm text-taupe">Some images are placeholders while the gallery is being filled with real work.</p>}
      <div className="mt-10">
        {items.length === 0 ? <p className="text-taupe">New work is being photographed. Please check back soon.</p> : <GalleryGrid items={items} categories={GALLERY_CATEGORIES} />}
      </div>
    </div>
  );
}
