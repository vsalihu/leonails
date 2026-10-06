import { currentAdmin } from "@/lib/server/auth";
import { assertSameOrigin, errorJson, json } from "@/lib/server/http";
import { ImageError, insertMedia, processImage, MAX_UPLOAD_BYTES } from "@/lib/server/images";
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
