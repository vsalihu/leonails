"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, fromZod, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { flagDurationChanges } from "@/lib/server/bookings";
import { parsePounds } from "@/lib/money";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60) || "item";
}

async function uniqueSlug(table: "treatments" | "extras", base: string, exceptId?: number) {
  let slug = base;
  for (let i = 2; ; i++) {
    const [r] = table === "treatments"
      ? await sql()`SELECT 1 FROM treatments WHERE slug = ${slug} AND id IS DISTINCT FROM ${exceptId ?? 0}`
      : await sql()`SELECT 1 FROM extras WHERE slug = ${slug} AND id IS DISTINCT FROM ${exceptId ?? 0}`;
    if (!r) return slug;
    slug = `${base}-${i}`;
  }
}

const itemSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  description: z.string().trim().max(400).default(""),
  price: z.string().refine((v) => parsePounds(v) !== null, "Enter a price like 30 or 32.50."),
  duration: z.coerce.number().int("Whole minutes only.").min(0).max(600),
  status: z.enum(["active", "inactive", "archived"]),
});

export async function saveTreatmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = itemSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  if (d.duration < 5) return fail("A treatment needs at least 5 minutes.", { duration: "At least 5 minutes." });
  const id = fd.int(form, "id");
  const price = parsePounds(d.price)!;
  const categoryId = fd.int(form, "categoryId");
  const notes = fd.opt(form, "notes");
  const featured = fd.bool(form, "featured");
  const extras = fd.ids(form, "extras");
  const db = sql();
  let treatmentId = id;
  let durationChanged = false;
  await db.begin(async (tx) => {
    if (id) {
      const [before] = await tx`SELECT duration_minutes, price_pence FROM treatments WHERE id = ${id}`;
      durationChanged = before.duration_minutes !== d.duration;
      await tx`
        UPDATE treatments SET name = ${d.name}, description = ${d.description}, notes = ${notes}, price_pence = ${price}, duration_minutes = ${d.duration},
          category_id = ${categoryId}, is_featured = ${featured}, status = ${d.status}, is_example = false, updated_at = now()
        WHERE id = ${id}`;
      await audit(tx, { type: "admin", id: admin.id }, "treatment.updated", "treatment", id, { details: { from: before, to: { price, duration: d.duration } } });
    } else {
      const slug = await uniqueSlug("treatments", slugify(d.name));
      const [{ max }] = await tx`SELECT coalesce(max(sort_order), 0)::int AS max FROM treatments`;
      const [r] = await tx`
        INSERT INTO treatments (slug, category_id, name, description, notes, price_pence, duration_minutes, is_featured, status, sort_order)
        VALUES (${slug}, ${categoryId}, ${d.name}, ${d.description}, ${notes}, ${price}, ${d.duration}, ${featured}, ${d.status}, ${max + 1}) RETURNING id`;
      treatmentId = r.id;
      await audit(tx, { type: "admin", id: admin.id }, "treatment.created", "treatment", r.id);
    }
    await tx`DELETE FROM treatment_extras WHERE treatment_id = ${treatmentId}`;
    for (const e of extras) await tx`INSERT INTO treatment_extras (treatment_id, extra_id) VALUES (${treatmentId}, ${e}) ON CONFLICT DO NOTHING`;
  });
  if (durationChanged) await flagDurationChanges(treatmentId!);
  revalidatePath("/admin/treatments");
  revalidatePath("/treatments");
  return done(durationChanged ? "Saved. Upcoming bookings keep their booked length; any affected ones are flagged for you to check." : "Saved.");
}

export async function saveExtraAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = itemSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const id = fd.int(form, "id");
  const price = parsePounds(d.price)!;
  if (id) {
    await sql()`UPDATE extras SET name = ${d.name}, description = ${d.description}, price_pence = ${price}, duration_minutes = ${d.duration}, status = ${d.status}, is_example = false, updated_at = now() WHERE id = ${id}`;
    await audit(sql(), { type: "admin", id: admin.id }, "extra.updated", "extra", id);
  } else {
    const slug = await uniqueSlug("extras", slugify(d.name));
    const [{ max }] = await sql()`SELECT coalesce(max(sort_order), 0)::int AS max FROM extras`;
    const [r] = await sql()`INSERT INTO extras (slug, name, description, price_pence, duration_minutes, status, sort_order) VALUES (${slug}, ${d.name}, ${d.description}, ${price}, ${d.duration}, ${d.status}, ${max + 1}) RETURNING id`;
    await audit(sql(), { type: "admin", id: admin.id }, "extra.created", "extra", r.id);
  }
  revalidatePath("/admin/treatments");
  return done("Saved.");
}

export async function moveAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = fd.int(form, "id")!;
  const table = fd.str(form, "table") === "extras" ? "extras" : "treatments";
  const dir = fd.str(form, "dir") === "up" ? -1 : 1;
  const db = sql();
  await db.begin(async (tx) => {
    const rows = table === "treatments"
      ? await tx`SELECT id FROM treatments WHERE status <> 'archived' ORDER BY sort_order, id`
      : await tx`SELECT id FROM extras WHERE status <> 'archived' ORDER BY sort_order, id`;
    const ids = rows.map((r) => r.id as number);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [n, rid] of ids.entries()) {
      if (table === "treatments") await tx`UPDATE treatments SET sort_order = ${n} WHERE id = ${rid}`;
      else await tx`UPDATE extras SET sort_order = ${n} WHERE id = ${rid}`;
    }
  });
  revalidatePath("/admin/treatments");
  return done("Order updated.");
}

export async function saveCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = fd.str(form, "name");
  if (name.length < 2) return fail("Enter a category name.", { name: "Enter a name." });
  const id = fd.int(form, "id");
  if (id) await sql()`UPDATE treatment_categories SET name = ${name}, is_example = false WHERE id = ${id}`;
  else {
    const [{ max }] = await sql()`SELECT coalesce(max(sort_order), 0)::int AS max FROM treatment_categories`;
    await sql()`INSERT INTO treatment_categories (slug, name, sort_order) VALUES (${slugify(name) + "-" + Date.now().toString(36)}, ${name}, ${max + 1})`;
  }
  revalidatePath("/admin/treatments");
  return done("Saved.");
}
