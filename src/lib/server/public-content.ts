import "server-only";
import { cache } from "react";
import { sql } from "./db";
import { mapMedia, type Media } from "../media";
import { getSettings, getContent } from "./settings";

/*
 * Public read model. Every query here selects explicit public columns only:
 * nothing from private_location, customers, bookings or admin tables.
 */

const MEDIA_COLS = "m.id, m.storage_key, m.width, m.height, m.variants, m.alt_text, m.caption, m.focal_x, m.focal_y, m.is_example";

export const publicSettings = cache(async () => {
  const s = await getSettings();
  return {
    businessName: s.businessName,
    publicLocation: s.publicLocation,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    instagramHandle: s.instagramHandle,
    bookingsEnabled: s.bookingsEnabled,
  };
});

export async function siteImages(slots: string[]): Promise<Record<string, Media | null>> {
  const db = sql();
  const rows = await db.unsafe(
    `SELECT si.slot, ${MEDIA_COLS} FROM site_images si JOIN media_assets m ON m.id = si.media_id WHERE si.slot = ANY($1) AND m.is_published`,
    [slots],
  );
  const out: Record<string, Media | null> = Object.fromEntries(slots.map((s) => [s, null]));
  for (const r of rows) out[r.slot] = mapMedia(r);
  return out;
}

export type GalleryItem = Media & { category: string | null; isFeatured: boolean; treatment: { slug: string; name: string } | null };

export async function galleryItems(opts: { featuredOnly?: boolean; limit?: number } = {}): Promise<GalleryItem[]> {
  const db = sql();
  const rows = await db.unsafe(
    `SELECT ${MEDIA_COLS}, m.category, m.is_featured, t.slug AS t_slug, t.name AS t_name
     FROM media_assets m LEFT JOIN treatments t ON t.id = m.related_treatment_id AND t.status = 'active'
     WHERE m.usage = 'gallery' AND m.is_published ${opts.featuredOnly ? "AND m.is_featured" : ""}
     ORDER BY m.is_featured DESC, m.sort_order, m.id
     LIMIT $1`,
    [opts.limit ?? 200],
  );
  return rows.map((r) => ({
    ...mapMedia(r)!,
    category: r.category,
    isFeatured: r.is_featured,
    treatment: r.t_slug ? { slug: r.t_slug, name: r.t_name } : null,
  }));
}

export const GALLERY_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "french", label: "French" },
  { slug: "nude", label: "Nude" },
  { slug: "nail-art", label: "Nail art" },
  { slug: "occasion", label: "Occasion" },
];

export type PublicTestimonial = {
  id: number;
  name: string;
  quote: string;
  rating: number | null;
  isExample: boolean;
  media: Media | null;
};

export async function testimonials(opts: { featuredOnly?: boolean; limit?: number } = {}): Promise<PublicTestimonial[]> {
  const db = sql();
  const rows = await db.unsafe(
    `SELECT t.id AS t_id, t.display_name, t.quote, t.rating, t.is_example AS t_example, ${MEDIA_COLS}
     FROM testimonials t LEFT JOIN media_assets m ON m.id = t.media_id AND m.is_published
     WHERE t.status = 'approved' ${opts.featuredOnly ? "AND t.is_featured" : ""}
     ORDER BY t.is_featured DESC, t.sort_order, t.created_at DESC
     LIMIT $1`,
    [opts.limit ?? 100],
  );
  return rows.map((r) => ({
    id: r.t_id,
    name: r.display_name,
    quote: r.quote,
    rating: r.rating,
    isExample: r.t_example,
    media: mapMedia(r),
  }));
}

export { getContent };

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Weekly opening hours for display (first open to last close per day, breaks omitted). */
export async function openingHours(): Promise<{ day: string; hours: string | null }[]> {
  const db = sql();
  const rows = await db`
    SELECT wh.weekday, min(wh.start_time)::text AS s, max(wh.end_time)::text AS e
    FROM working_hours wh JOIN technicians t ON t.id = wh.technician_id AND t.is_default
    GROUP BY wh.weekday`;
  const byDay = new Map(rows.map((r) => [r.weekday as number, `${r.s.slice(0, 5)} to ${r.e.slice(0, 5)}`]));
  return [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: DAY_NAMES[d], hours: byDay.get(d) ?? null }));
}
