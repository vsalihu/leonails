import { currentAdmin } from "@/lib/server/auth";
import { assertSameOrigin, errorJson, json } from "@/lib/server/http";
import { ImageError, insertMedia, processImage, storeVideo, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from "@/lib/server/images";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

/** POST /api/admin/media (multipart: file, usage). One image per request. */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const admin = await currentAdmin();
  if (!admin) return errorJson("Please sign in again.", 401);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson("The upload couldn't be read.", 400);
  }
  const file = form.get("file");
  const usage = form.get("usage") === "site" ? "site" : "gallery";
  if (!(file instanceof File) || file.size === 0) return errorJson("Choose an image to upload.", 422);
  const looksLikeVideo = file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(file.name);
  if (looksLikeVideo) {
    if (usage !== "site") return errorJson("Videos can only be added under Website images (for the homepage hero).", 422);
    if (file.size > MAX_VIDEO_BYTES) return errorJson(`${file.name} is larger than 40 MB.`, 422);
    try {
      const v = await storeVideo(Buffer.from(await file.arrayBuffer()));
      const db = sql();
      const [r] = await db`
        INSERT INTO media_assets (storage_key, width, height, variants, alt_text, usage, is_published, provenance, kind, mime, byte_size)
        VALUES (${v.storageKey}, 0, 0, ${[]}, '', 'site', false, 'Uploaded by admin', 'video', ${v.mime}, ${file.size}) RETURNING id`;
      await audit(db, { type: "admin", id: admin.id }, "media.uploaded", "media", r.id, { details: { name: file.name, size: file.size, kind: "video" } });
      return json({ id: r.id });
    } catch (err) {
      if (err instanceof ImageError) return errorJson(`${file.name}: ${err.message}`, 422);
      throw err;
    }
  }
  if (file.size > MAX_UPLOAD_BYTES) return errorJson(`${file.name} is larger than 15 MB.`, 422);
  try {
    const img = await processImage(Buffer.from(await file.arrayBuffer()), usage);
    const db = sql();
    const [{ max }] = await db`SELECT coalesce(max(sort_order), 0)::int AS max FROM media_assets WHERE usage = ${usage}`;
    const id = await insertMedia(db, img, {
      usage,
      altText: "",
      category: (form.get("category") as string) || null,
      isPublished: false,
      provenance: "Uploaded by admin",
      sortOrder: max + 1,
    });
    await audit(db, { type: "admin", id: admin.id }, "media.uploaded", "media", id, { details: { name: file.name, size: file.size } });
    return json({ id });
  } catch (err) {
    if (err instanceof ImageError) return errorJson(`${file.name}: ${err.message}`, 422);
    console.error("[upload]", err);
    return errorJson(`${file.name} couldn't be processed. Please try another image.`, 500);
  }
}
