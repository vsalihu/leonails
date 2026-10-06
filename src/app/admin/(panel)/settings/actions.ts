"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, changePassword } from "@/lib/server/auth";
import { done, fail, fd, fromZod, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { defaultTechnicianId } from "@/lib/server/schedule";
import { flagScheduleConflicts } from "@/lib/server/bookings";

function refreshSite() {
  revalidatePath("/", "layout");
}

const businessSchema = z.object({
  businessName: z.string().trim().min(2, "Enter a business name.").max(80),
  publicLocation: z.string().trim().min(2, "Enter the town shown publicly.").max(80),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
  notificationEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
  contactPhone: z.string().trim().max(30),
  instagramHandle: z.string().trim().max(40),
});

export async function businessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const p = businessSchema.safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return fromZod(p.error);
  const d = p.data;
  await sql()`
    UPDATE business_settings SET business_name = ${d.businessName}, public_location = ${d.publicLocation},
      contact_email = ${d.contactEmail || null}, notification_email = ${d.notificationEmail || null},
      contact_phone = ${d.contactPhone || null}, instagram_handle = ${d.instagramHandle.replace(/^@/, "") || null},
      is_example = false, updated_at = now() WHERE id = 1`;
  await audit(sql(), { type: "admin", id: admin.id }, "settings.business_updated", "settings", 1);
  refreshSite();
  return done();
}

const rulesSchema = z.object({
  slotInterval: z.coerce.number().int().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), "Choose 5, 10, 15, 20, 30 or 60."),
  buffer: z.coerce.number().int().min(0).max(120),
  hold: z.coerce.number().int().min(2).max(30),
  minNoticeHours: z.coerce.number().min(0).max(24 * 14),
  horizonDays: z.coerce.number().int().min(1).max(365),
  cutoffHours: z.coerce.number().min(0).max(24 * 14),
  reminderHours: z.coerce.number().min(1).max(24 * 7),
});

export async function rulesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const p = rulesSchema.safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return fromZod(p.error);
  const d = p.data;
  await sql()`
    UPDATE business_settings SET slot_interval_minutes = ${d.slotInterval}, buffer_minutes = ${d.buffer}, hold_minutes = ${d.hold},
      min_notice_minutes = ${Math.round(d.minNoticeHours * 60)}, horizon_days = ${d.horizonDays},
      customer_change_cutoff_minutes = ${Math.round(d.cutoffHours * 60)}, reminder_lead_minutes = ${Math.round(d.reminderHours * 60)},
      reminders_enabled = ${fd.bool(form, "reminders")}, bookings_enabled = ${fd.bool(form, "bookingsEnabled")}, updated_at = now()
    WHERE id = 1`;
  await audit(sql(), { type: "admin", id: admin.id }, "settings.rules_updated", "settings", 1, { details: d });
  refreshSite();
  return done("Saved. Changes apply to new bookings; existing bookings keep their times and buffers.");
}

export async function hoursAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const tech = await defaultTechnicianId();
  const rows: { weekday: number; start: string; end: string }[] = [];
  for (let d = 1; d <= 7; d++) {
    if (!fd.bool(form, `open-${d}`)) continue;
    for (const k of [1, 2]) {
      const start = fd.str(form, `d${d}s${k}`);
      const end = fd.str(form, `d${d}e${k}`);
      if (!start && !end) continue;
      if (!start || !end || end <= start) return fail(`Check the times for ${["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d]}: each period needs a start before its end.`);
      rows.push({ weekday: d, start, end });
    }
  }
  for (const d of new Set(rows.map((r) => r.weekday))) {
    const day = rows.filter((r) => r.weekday === d).sort((a, b) => a.start.localeCompare(b.start));
    if (day.length === 2 && day[1].start < day[0].end) return fail("Two periods on the same day overlap.");
  }
  await sql().begin(async (tx) => {
    await tx`DELETE FROM working_hours WHERE technician_id = ${tech}`;
    for (const r of rows) await tx`INSERT INTO working_hours (technician_id, weekday, start_time, end_time) VALUES (${tech}, ${r.weekday}, ${r.start}, ${r.end})`;
    await audit(tx, { type: "admin", id: admin.id }, "schedule.hours_updated", "technician", tech, { details: { rows } });
  });
  const flagged = await flagScheduleConflicts();
  refreshSite();
  return done(flagged > 0 ? `Saved. ${flagged} upcoming booking${flagged > 1 ? "s fall" : " falls"} outside the new hours and ${flagged > 1 ? "are" : "is"} flagged for you to check. Nothing was moved or cancelled.` : "Saved.");
}

export async function addressAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const lines = fd.str(form, "addressLines");
  if (lines.length < 5) return fail("Enter the full address.", { addressLines: "Enter the full address." });
  await sql()`
    INSERT INTO private_location (id, address_lines, postcode, arrival_instructions, is_example) VALUES (1, ${lines}, ${fd.opt(form, "postcode")}, ${fd.opt(form, "arrival")}, false)
    ON CONFLICT (id) DO UPDATE SET address_lines = EXCLUDED.address_lines, postcode = EXCLUDED.postcode, arrival_instructions = EXCLUDED.arrival_instructions, is_example = false, updated_at = now()`;
  await audit(sql(), { type: "admin", id: admin.id }, "settings.address_updated", "settings", 1);
  return done("Saved. New confirmation and reminder emails will use this address.");
}

const COPY_KEYS = ["home.hero", "home.intro", "home.visit", "about.body", "about.studio", "treatments.intro", "treatments.removal"];

export async function copyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const key = fd.str(form, "key");
  if (!COPY_KEYS.includes(key)) return fail("Unknown section.");
  const body = fd.str(form, "body");
  if (body.length > 4000) return fail("That's too long.");
  await sql()`
    INSERT INTO content_blocks (key, title, body, is_example) VALUES (${key}, ${fd.opt(form, "title")}, ${body}, false)
    ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, is_example = false, updated_at = now()`;
  await audit(sql(), { type: "admin", id: admin.id }, "content.updated", "content", null, { details: { key } });
  refreshSite();
  return done();
}

export async function policyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const kind = fd.str(form, "kind");
  if (!["cancellation", "privacy", "booking_terms"].includes(kind)) return fail("Unknown policy.");
  const body = fd.str(form, "body");
  if (body.length < 20) return fail("The policy text is too short.", { body: "Write the full policy." });
  const [cur] = await sql()`SELECT body FROM policies WHERE kind = ${kind} ORDER BY version DESC LIMIT 1`;
  if (cur?.body === body) return done("No changes.");
  // New version: bookings keep the version they agreed to.
  const [r] = await sql()`
    INSERT INTO policies (kind, version, body) VALUES (${kind}, (SELECT coalesce(max(version), 0) + 1 FROM policies WHERE kind = ${kind}), ${body})
    RETURNING version`;
  await audit(sql(), { type: "admin", id: admin.id }, "policy.published", "policy", null, { details: { kind, version: r.version } });
  refreshSite();
  return done(`Published as version ${r.version}.`);
}

export async function passwordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const next = fd.str(form, "next");
  if (next !== fd.str(form, "confirm")) return fail("The new passwords don't match.", { confirm: "Doesn't match." });
  const r = await changePassword(admin.id, String(form.get("current") ?? ""), next);
  return r.ok ? done("Password changed.") : fail(r.error);
}
