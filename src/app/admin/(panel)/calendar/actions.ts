"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, fromZod, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { defaultTechnicianId } from "@/lib/server/schedule";
import { flagScheduleConflicts } from "@/lib/server/bookings";
import { audit } from "@/lib/server/audit";

const blockSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  kind: z.enum(["blocked", "closed", "custom_hours"]),
  start: z.string().optional(),
  end: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Blocks time, closes a day, or sets custom hours. Existing bookings are flagged, never moved. */
export async function blockTimeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = blockSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fromZod(parsed.error);
  const { date, kind, note } = parsed.data;
  const start = kind === "closed" ? null : parsed.data.start || null;
  const end = kind === "closed" ? null : parsed.data.end || null;
  if (kind !== "closed" && (!start || !end || end <= start)) return fail("Choose a start and end time, with the end after the start.", { end: "End must be after start." });
  const tech = await defaultTechnicianId();
  const [row] = await sql()`
    INSERT INTO schedule_exceptions (technician_id, local_date, kind, start_time, end_time, note, created_by)
    VALUES (${tech}, ${date}, ${kind}, ${start}, ${end}, ${note || null}, ${admin.id}) RETURNING id`;
  await audit(sql(), { type: "admin", id: admin.id }, "schedule.exception_added", "schedule_exception", row.id, { details: { date, kind, start, end } });
  const flagged = await flagScheduleConflicts();
  revalidatePath("/admin/calendar");
  return done(flagged > 0 ? `Saved. ${flagged} existing booking${flagged > 1 ? "s are" : " is"} now outside working time and flagged for you to check; nothing was moved.` : "Saved.");
}

export async function removeExceptionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  await sql()`DELETE FROM schedule_exceptions WHERE id = ${id}`;
  await audit(sql(), { type: "admin", id: admin.id }, "schedule.exception_removed", "schedule_exception", id);
  await flagScheduleConflicts();
  revalidatePath("/admin/calendar");
  return done("Removed.");
}
