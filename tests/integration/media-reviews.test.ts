import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { rm } from "node:fs/promises";
import { sql } from "@/lib/server/db";
import { processImage, ImageError } from "@/lib/server/images";
import { storage } from "@/lib/server/storage";
import { testimonials, galleryItems } from "@/lib/server/public-content";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await rm("./storage-test", { recursive: true, force: true });
});

/** A JPEG carrying EXIF metadata, including GPS coordinates. */
async function jpegWithGps() {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 200, g: 170, b: 150 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestCam", Model: "Leak 1", Artist: "Someone" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 39/1 52/1", GPSLongitudeRef: "E", GPSLongitude: "0/1 9/1 36/1" },
    })
    .toBuffer();
}

describe("image uploads", () => {
  it("strips embedded metadata, including GPS location, from every stored variant", async () => {
    const input = await jpegWithGps();
    const meta = await sharp(input).metadata();
    expect(meta.exif).toBeDefined(); // the fixture really carries EXIF
    const img = await processImage(input, "gallery");
    expect(img.variants.length).toBeGreaterThan(1);
    for (const w of img.variants) {
      const out = (await storage().get(`${img.storageKey}/${w}.webp`))!;
      const m = await sharp(out).metadata();
      expect(m.format).toBe("webp");
      expect(m.exif).toBeUndefined();
      expect(m.xmp).toBeUndefined();
      expect(m.iptc).toBeUndefined();
      expect(out.includes(Buffer.from("TestCam"))).toBe(false);
    }
  });

  it("rejects files that aren't images, whatever their name", async () => {
    await expect(processImage(Buffer.from("<?php echo 'hi'; ?>"), "gallery")).rejects.toBeInstanceOf(ImageError);
    await expect(processImage(Buffer.from("%PDF-1.4 fake"), "gallery")).rejects.toThrow(/supported image/);
    await expect(processImage(Buffer.alloc(0), "gallery")).rejects.toThrow(/empty/);
  });

  it("rejects tiny and oversized images with a useful message", async () => {
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(processImage(tiny, "gallery")).rejects.toThrow(/at least 300 pixels/);
    await expect(processImage(Buffer.alloc(16 * 1024 * 1024, 1), "gallery")).rejects.toThrow(/15 MB/);
  });

  it("unpublished gallery images never appear publicly", async () => {
    const img = await processImage(await jpegWithGps(), "gallery");
    await sql()`INSERT INTO media_assets (storage_key, width, height, variants, alt_text, usage, is_published) VALUES (${img.storageKey}, ${img.width}, ${img.height}, ${img.variants}, 'x', 'gallery', false)`;
    expect(await galleryItems()).toHaveLength(0);
    await sql()`UPDATE media_assets SET is_published = true`;
    expect(await galleryItems()).toHaveLength(1);
  });
});

describe("testimonials", () => {
  it("customer submissions stay pending until approved", async () => {
    await sql()`INSERT INTO testimonials (display_name, quote, source, status, consent_given_at) VALUES ('Ana', 'Lovely nails, thank you so much', 'customer', 'pending', now())`;
    expect(await testimonials()).toHaveLength(0);
    await sql()`UPDATE testimonials SET status = 'approved'`;
    expect(await testimonials()).toHaveLength(1);
    await sql()`UPDATE testimonials SET status = 'hidden'`;
    expect(await testimonials()).toHaveLength(0);
  });

  it("only one review per booking", async () => {
    const db = sql();
    const [t] = await db`SELECT id FROM technicians LIMIT 1`;
    const [c] = await db`INSERT INTO customers (email, name) VALUES ('r@example.test', 'R') RETURNING id`;
    const [b] = await db`
      INSERT INTO bookings (reference, technician_id, customer_id, status, starts_at, ends_at, buffer_minutes, customer_name, customer_email, subtotal_pence, total_pence, source)
      VALUES ('RN-TEST01', ${t.id}, ${c.id}, 'completed', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 15, 'R', 'r@example.test', 3000, 3000, 'online') RETURNING id`;
    await db`INSERT INTO testimonials (display_name, quote, source, booking_id) VALUES ('R', 'Great visit, really happy', 'customer', ${b.id})`;
    await expect(db`INSERT INTO testimonials (display_name, quote, source, booking_id) VALUES ('R', 'Second attempt here', 'customer', ${b.id})`).rejects.toMatchObject({ code: "23505" });
  });
});
