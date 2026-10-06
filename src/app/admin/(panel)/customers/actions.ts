"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { normalisePhone } from "@/lib/server/customers";

export async function notesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  await sql()`UPDATE customers SET private_notes = ${fd.opt(form, "notes")}, updated_at = now() WHERE id = ${id}`;
  await audit(sql(), { type: "admin", id: admin.id }, "customer.notes_updated", "customer", id);
  revalidatePath(`/admin/customers/${id}`);
  return done("Notes saved.");
}

export async function contactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const name = fd.str(form, "name");
  if (name.length < 2) return fail("Enter a name.", { name: "Enter a name." });
  const phone = fd.opt(form, "phone");
  await sql()`UPDATE customers SET name = ${name}, phone = ${phone}, phone_normalised = ${normalisePhone(phone)}, updated_at = now() WHERE id = ${id}`;
  await audit(sql(), { type: "admin", id: admin.id }, "customer.updated", "customer", id);
  revalidatePath(`/admin/customers/${id}`);
  return done("Saved.");
}

export async function blockAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const block = fd.str(form, "block") === "1";
  const reason = fd.opt(form, "reason");
  if (block && !reason) return fail("Give a reason for blocking.", { reason: "A reason is required." });
  await sql()`
    UPDATE customers SET is_blocked = ${block}, blocked_reason = ${block ? reason : null}, blocked_at = ${block ? new Date() : null}, updated_at = now()
    WHERE id = ${id}`;
  await audit(sql(), { type: "admin", id: admin.id }, block ? "customer.blocked" : "customer.unblocked", "customer", id, { reason });
  revalidatePath(`/admin/customers/${id}`);
  return done(block ? "Blocked from online booking. Existing appointments are unchanged." : "Unblocked.");
}
