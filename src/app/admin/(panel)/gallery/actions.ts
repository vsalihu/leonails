"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { deleteMedia } from "@/lib/server/images";
import { audit } from "@/lib/server/audit";

const IMAGE_SLOTS = ["home.hero", "home.intro", "about.portrait", "visit.studio"];
const VIDEO_SLOTS = ["home.hero.video", "home.hero.video.mobile"];

export async function saveMediaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const alt = fd.str(form, "alt");
  const publish = fd.bool(form, "published");
  const [m] = await sql()`SELECT kind FROM media_assets WHERE id = ${id}`;
  if (!m) return fail("Not found.");
  if (publish && alt.length < 5) return fail("Add a short description (alt text) before publishing.", { alt: "Describe the image for people who can't see it." });
  const fx = Number(form.get("focalX") ?? 50);
  const fy = Number(form.get("focalY") ?? 50);
  await sql()`
    UPDATE media_assets SET alt_text = ${alt}, caption = ${fd.opt(form, "caption")}, category = ${fd.opt(form, "category")},
      related_treatment_id = ${fd.int(form, "treatmentId")}, is_published = ${publish}, is_featured = ${fd.bool(form, "featured")},
      focal_x = ${Number.isFinite(fx) ? fx : 50}, focal_y = ${Number.isFinite(fy) ? fy : 50}, is_example = false
    WHERE id = ${id}`;
  const slot = fd.opt(form, "slot");
  if (slot === "none") {
    await sql()`DELETE FROM site_images WHERE slot = ANY(${VIDEO_SLOTS}) AND media_id = ${id}`;
  } else if (slot && (m.kind === "video" ? VIDEO_SLOTS : IMAGE_SLOTS).includes(slot)) {
    await sql()`INSERT INTO site_images (slot, media_id) VALUES (${slot}, ${id}) ON CONFLICT (slot) DO UPDATE SET media_id = EXCLUDED.media_id`;
  }
  await audit(sql(), { type: "admin", id: admin.id }, "media.updated", "media", id, { details: { publish, slot } });
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
  revalidatePath("/");
  return done("Saved.");
}

export async function moveMediaAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = fd.int(form, "id")!;
  const dir = fd.str(form, "dir") === "up" ? -1 : 1;
  await sql().begin(async (tx) => {
    const ids = (await tx`SELECT id FROM media_assets WHERE usage = 'gallery' ORDER BY sort_order, id`).map((r) => r.id as number);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [n, rid] of ids.entries()) await tx`UPDATE media_assets SET sort_order = ${n} WHERE id = ${rid}`;
  });
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
  return done("Moved.");
}

export async function deleteMediaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  await deleteMedia(id);
  await audit(sql(), { type: "admin", id: admin.id }, "media.deleted", "media", id);
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
  revalidatePath("/");
  return done("Deleted.");
}
