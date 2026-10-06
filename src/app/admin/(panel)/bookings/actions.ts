"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { cancelBooking, createManualBooking, recordPayment, rescheduleBooking, setBookingStatus } from "@/lib/server/bookings";
import { caught, done, fail, fd, fromZod, type ActionState } from "@/lib/server/action";
import { getSettings } from "@/lib/server/settings";
import { sql } from "@/lib/server/db";
import { enqueue } from "@/lib/server/notifications/outbox";
import { kickWorker } from "@/lib/server/notifications/worker";
import { revokeTokens } from "@/lib/server/booking-access";
import { audit } from "@/lib/server/audit";
import { parsePounds } from "@/lib/money";

async function localToDate(date: string, time: string) {
  const s = await getSettings();
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: s.timezone });
  if (!dt.isValid) return null;
  // reject times that don't exist locally (spring-forward gap)
  if (dt.toFormat("HH:mm") !== time.slice(0, 5)) return null;
  return dt.toJSDate();
}

export async function cancelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  try {
    await cancelBooking(id, { type: "admin", id: admin.id }, {
      reason: fd.opt(form, "reason"),
      overrideCutoff: fd.bool(form, "override"),
      notifyCustomer: fd.bool(form, "notify"),
    });
  } catch (e) {
    return caught(e);
  }
  kickWorker();
  revalidatePath(`/admin/bookings/${id}`);
  return done("Appointment cancelled. The time is free again.");
}

export async function rescheduleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const start = await localToDate(fd.str(form, "date"), fd.str(form, "time"));
  if (!start) return fail("Choose a valid date and time.", { time: "That time doesn't exist (clocks change) or is invalid." });
  try {
    const out = await rescheduleBooking(id, start, { type: "admin", id: admin.id }, {
      reason: fd.opt(form, "reason"),
      overrideCutoff: fd.bool(form, "override"),
      acceptPriceChange: fd.bool(form, "acceptPrice"),
      allowOutsideHours: fd.bool(form, "outsideHours"),
    });
    if (!out.ok) {
      const n = out.needsPriceConfirmation;
      return fail(`${n.reason}. The total would change from £${(n.oldTotalPence / 100).toFixed(2)} to £${(n.newTotalPence / 100).toFixed(2)}. Tick "accept price change" to continue.`);
    }
  } catch (e) {
    return caught(e);
  }
  kickWorker();
  revalidatePath(`/admin/bookings/${id}`);
  return done("Appointment moved and the customer has been emailed.");
}

export async function statusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const status = fd.str(form, "status");
  if (status !== "completed" && status !== "no_show") return fail("Choose a status.");
  try {
    await setBookingStatus(id, status, admin.id, { reason: fd.opt(form, "reason"), sendReviewInvite: fd.bool(form, "invite") });
  } catch (e) {
    return caught(e);
  }
  kickWorker();
  revalidatePath(`/admin/bookings/${id}`);
  return done(status === "completed" ? "Marked as completed." : "Marked as no-show.");
}

export async function paymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const pence = parsePounds(fd.str(form, "amount"));
  if (pence === null) return fail("Enter the amount received, for example 30 or 28.50.", { amount: "Enter an amount like 30 or 28.50." });
  const method = fd.str(form, "method");
  if (!["cash", "card", "bank_transfer", "other"].includes(method)) return fail("Choose how they paid.");
  try {
    await recordPayment(id, admin.id, pence, method);
  } catch (e) {
    return caught(e);
  }
  revalidatePath(`/admin/bookings/${id}`);
  return done("Payment recorded.");
}

export async function resendConfirmationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const [b] = await sql()`SELECT customer_email, status FROM bookings WHERE id = ${id}`;
  if (!b || b.status !== "confirmed") return fail("Only confirmed appointments can be re-sent.");
  await enqueue(sql(), { kind: "booking_confirmation", dedupeKey: `confirmation:${id}:resend:${Date.now()}`, recipient: b.customer_email, bookingId: id });
  await audit(sql(), { type: "admin", id: admin.id }, "booking.confirmation_resent", "booking", id);
  kickWorker();
  return done("Confirmation queued. It includes a fresh management link.");
}

export async function revokeLinksAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  await revokeTokens(id);
  await audit(sql(), { type: "admin", id: admin.id }, "booking.links_revoked", "booking", id);
  return done("All customer links for this booking have been revoked.");
}

const manualSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().max(30).optional(),
  treatmentId: z.coerce.number().int().positive("Choose a treatment."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time."),
});

export async function createBookingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = manualSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fromZod(parsed.error);
  const start = await localToDate(parsed.data.date, parsed.data.time);
  if (!start) return fail("That time doesn't exist (clocks change) or is invalid.", { time: "Invalid time." });
  const discountText = fd.str(form, "discount");
  let manualDiscount: { pence: number; reason: string } | null = null;
  if (discountText) {
    const pence = parsePounds(discountText);
    if (pence === null) return fail("Enter the discount as an amount, like 5 or 7.50.", { discount: "Invalid amount." });
    manualDiscount = { pence, reason: fd.str(form, "discountReason") };
    if (fd.opt(form, "code")) return fail("Use either an offer code or a manual discount, not both.");
  }
  let id: number;
  try {
    const r = await createManualBooking(admin.id, {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      treatmentId: parsed.data.treatmentId,
      extraIds: fd.ids(form, "extras"),
      startsAt: start,
      notes: fd.opt(form, "notes"),
      code: fd.opt(form, "code"),
      manualDiscount,
      sendConfirmation: fd.bool(form, "sendConfirmation"),
      allowOutsideHours: fd.bool(form, "outsideHours"),
    });
    id = r.bookingId;
  } catch (e) {
    return caught(e);
  }
  kickWorker();
  redirect(`/admin/bookings/${id}?created=1`);
}
