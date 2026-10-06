import "server-only";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { storage } from "./storage";
import { sql, type Db } from "./db";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);
export const VARIANT_WIDTHS = [480, 960, 1600, 2400];

export class ImageError extends Error {}

export type ProcessedImage = { storageKey: string; width: number; height: number; variants: number[] };

/**
 * Validates by decoding (not by extension or client MIME type), auto-orients,
 * and re-encodes to WebP at several widths. Re-encoding drops all embedded
 * metadata (EXIF incl. GPS, XMP, IPTC) because sharp only writes metadata when
 * explicitly asked to.
 */
export async function processImage(input: Buffer, prefix: "gallery" | "site" | "testimonial" | "review"): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageError("The file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError("Images must be 15 MB or smaller.");
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new ImageError("That file isn't a supported image. Please upload a JPEG, PNG, WebP or HEIC photo.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new ImageError("That file isn't a supported image. Please upload a JPEG, PNG, WebP or HEIC photo.");
  }
  const base = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
  const { info } = await base.clone().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  if (width < 300 || height < 300) throw new ImageError("Please upload an image at least 300 pixels wide and tall.");

  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}`;
  const widths = VARIANT_WIDTHS.filter((w) => w < width);
  widths.push(Math.min(width, 3200));
  const variants = [...new Set(widths)].sort((a, b) => a - b);
  for (const w of variants) {
    const out = await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await storage().put(`${key}/${w}.webp`, out, "image/webp");
  }
  const scale = variants.at(-1)! / width;
  return { storageKey: key, width: Math.round(width * scale), height: Math.round(height * scale), variants };
}

export async function insertMedia(
  db: Db,
  img: ProcessedImage,
  fields: { usage: "gallery" | "site" | "testimonial"; altText: string; caption?: string | null; category?: string | null; isPublished?: boolean; provenance?: string | null; isExample?: boolean; sortOrder?: number },
) {
  const [r] = await db`
    INSERT INTO media_assets (storage_key, width, height, variants, alt_text, caption, category, usage, is_published, provenance, is_example, sort_order)
    VALUES (${img.storageKey}, ${img.width}, ${img.height}, ${img.variants}, ${fields.altText}, ${fields.caption ?? null}, ${fields.category ?? null},
            ${fields.usage}, ${fields.isPublished ?? false}, ${fields.provenance ?? null}, ${fields.isExample ?? false}, ${fields.sortOrder ?? 0})
    RETURNING id`;
  return r.id as number;
}

export async function deleteMedia(id: number) {
  const db = sql();
  const [r] = await db`DELETE FROM media_assets WHERE id = ${id} RETURNING storage_key`;
  if (r) await storage().removePrefix(r.storage_key);
}
