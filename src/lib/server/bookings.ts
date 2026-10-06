import "server-only";
import { randomBytes } from "node:crypto";
import { sql, pgCode, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, type Db, type Tx } from "./db";
import { getSettings, currentPolicyVersions, type Settings } from "./settings";
import { resolveSelection } from "./catalogue";
import { quoteBooking, loadPromotion } from "./promotions";
import { upsertCustomerForUpdate, normalisePhone } from "./customers";
import { BookingError, holdStillFits } from "./holds";
import { enqueue, cancelPendingJobs, scheduleReminder } from "./notifications/outbox";
import { audit, type Actor } from "./audit";
import { totalDuration, type PriceLine, type Quote } from "../pricing";
import { localDateOf } from "../availability";
import { slotsForDate, defaultTechnicianId } from "./schedule";

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newReference(): string {
  const bytes = randomBytes(6);
  return "RN-" + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

async function insertBooking(
  tx: Tx,
  b: {
    technicianId: number;
    customerId: number;
    startsAt: Date;
    endsAt: Date;
    bufferMinutes: number;
    name: string;
    email: string;
    phone: string | null;
    quote: Quote;
    policyVersions: Record<string, number>;
    notes: string | null;
    source: "online" | "admin";
    idempotencyKey: string | null;
    holdId: number | null;
    manualDiscount?: { pence: number; reason: string } | null;
  },
) {
  const promoSnapshot = b.quote.applied
    ? { promotionId: b.quote.applied.promotionId, name: b.quote.applied.name, code: b.quote.applied.code, savingPence: b.quote.applied.savingPence }
    : null;
  const discount = b.manualDiscount ? b.manualDiscount.pence : b.quote.discountPence;
  for (let attempt = 0; ; attempt++) {
    try {
      const [row] = await tx`
        INSERT INTO bookings (reference, technician_id, customer_id, status, starts_at, ends_at, buffer_minutes,
          customer_name, customer_email, customer_phone, subtotal_pence, discount_pence, total_pence,
          promotion_id, promotion_snapshot, manual_discount_reason, policy_versions, customer_notes, source, idempotency_key, hold_id)
        VALUES (${newReference()}, ${b.technicianId}, ${b.customerId}, 'confirmed', ${b.startsAt}, ${b.endsAt}, ${b.bufferMinutes},
          ${b.name}, ${b.email}, ${b.phone}, ${b.quote.subtotalPence}, ${discount}, ${b.quote.subtotalPence - discount},
          ${b.manualDiscount ? null : (b.quote.applied?.promotionId ?? null)},
          ${b.manualDiscount ? null : promoSnapshot ? tx.json(promoSnapshot) : null},
          ${b.manualDiscount?.reason ?? null}, ${tx.json(b.policyVersions)}, ${b.notes}, ${b.source}, ${b.idempotencyKey}, ${b.holdId})
        RETURNING *`;
      for (const [i, l] of b.quote.lines.entries()) {
        await tx`
          INSERT INTO booking_items (booking_id, kind, treatment_id, extra_id, name, price_pence, duration_minutes, sort_order)
          VALUES (${row.id}, ${l.kind}, ${l.kind === "treatment" ? l.id : null}, ${l.kind === "extra" ? l.id : null}, ${l.name}, ${l.pricePence}, ${l.durationMinutes}, ${i})`;
      }
      if (!b.manualDiscount && b.quote.applied) {
        await tx`
          INSERT INTO promotion_redemptions (promotion_id, booking_id, customer_id, status, saving_pence)
          VALUES (${b.quote.applied.promotionId}, ${row.id}, ${b.customerId}, 'reserved', ${b.quote.applied.savingPence})`;
      }
      return row;
    } catch (err) {
      // retry only on a reference collision
      if (pgCode(err) === PG_UNIQUE_VIOLATION && String((err as Error).message).includes("reference") && attempt < 5) continue;
      throw err;
    }
  }
}

async function queueConfirmation(tx: Tx, settings: Settings, booking: Record<string, any>) {
  await enqueue(tx, {
    kind: "booking_confirmation",
    dedupeKey: `confirmation:${booking.id}`,
    recipient: booking.customer_email,
    bookingId: booking.id,
  });
  await scheduleReminder(tx, { id: booking.id, startsAt: booking.starts_at, email: booking.customer_email }, settings.reminderLeadMinutes, settings.remindersEnabled);
  if (settings.notificationEmail) {
    await enqueue(tx, {
      kind: "admin_new_booking",
      dedupeKey: `admin-new:${booking.id}`,
      recipient: settings.notificationEmail,
      bookingId: booking.id,
    });
  }
}

export type ConfirmInput = {
  holdPublicId: string;
  sessionId: string;
  idempotencyKey: string;
  name: string;
  email: string;
  phone: string;
  notes: string | null;
  code: string | null;
  expectedTotalPence: number;
};

export type ConfirmResult = { bookingId: number; reference: string; replayed: boolean };

/**
 * Converts a verified hold into a confirmed booking atomically:
 * - the hold row is locked, so concurrent/double submissions serialise;
 * - the hold's calendar block is converted in place (it cannot conflict with itself);
 * - prices and promotions are recalculated here and compared to what the customer saw;
 * - promotion rows are locked while usage is counted, so limits cannot be exceeded.
 */
export async function confirmBooking(input: ConfirmInput): Promise<ConfirmResult> {
  const db = sql();
  const settings = await getSettings();

  return db.begin(async (tx) => {
    const [existing] = await tx`SELECT id, reference, hold_id FROM bookings WHERE idempotency_key = ${input.idempotencyKey}`;
    if (existing) return { bookingId: existing.id, reference: existing.reference, replayed: true };

    const [hold] = await tx`SELECT * FROM slot_holds WHERE public_id = ${input.holdPublicId} AND session_id = ${input.sessionId} FOR UPDATE`;
    if (!hold) throw new BookingError("We couldn't find your reserved time. Please choose a time again.", "hold_expired");
    if (hold.converted_booking_id) {
      const [b] = await tx`SELECT id, reference FROM bookings WHERE id = ${hold.converted_booking_id}`;
      return { bookingId: b.id, reference: b.reference, replayed: true };
    }
    if (hold.released_at || hold.expires_at.getTime() <= Date.now()) {
      await tx`DELETE FROM calendar_blocks WHERE hold_id = ${hold.id}`;
      throw new BookingError("Your reserved time expired before the booking was confirmed. Please choose a time again.", "hold_expired");
    }
    const [block] = await tx`SELECT id FROM calendar_blocks WHERE hold_id = ${hold.id} FOR UPDATE`;
    if (!block) throw new BookingError("Your reserved time is no longer held. Please choose a time again.", "hold_expired");
    if (!hold.email_verified_at || !hold.email || hold.email !== input.email.trim().toLowerCase())
      throw new BookingError("Please verify your email address before confirming.", "not_verified");
    if (!settings.bookingsEnabled) throw new BookingError("Online booking is paused at the moment.", "closed");

    // Revalidate the selection against the live catalogue.
    const lines = await resolveSelection(hold.treatment_id, (hold.extra_ids as number[]).map(Number), tx);
    const duration = totalDuration(lines);
    if (hold.starts_at.getTime() + duration * 60_000 !== hold.ends_at.getTime())
      throw new BookingError("The treatment details changed while you were booking. Please choose a time again.", "invalid");
    if (!(await holdStillFits(hold.technician_id, hold.starts_at, hold.ends_at, settings.timezone, tx)))
      throw new BookingError("That time is no longer within opening hours. Please choose another.", "slot_taken");

    const customer = await upsertCustomerForUpdate(tx, { email: hold.email, name: input.name, phone: input.phone, verified: true });
    if (customer.isBlocked)
      throw new BookingError("We're unable to take this booking online. Please get in touch directly.", "blocked");

    const quote = await quoteBooking(tx, {
      lines,
      appointmentLocalDate: localDateOf(hold.starts_at, settings.timezone),
      code: input.code,
      customer: { id: customer.id, phoneNormalised: customer.phoneNormalised },
      lock: true,
    });
    if (quote.totalPence !== input.expectedTotalPence) {
      throw new BookingError("The price has changed. Please review the updated total before confirming.", "price_changed", { quote });
    }

    const booking = await insertBooking(tx, {
      technicianId: hold.technician_id,
      customerId: customer.id,
      startsAt: hold.starts_at,
      endsAt: hold.ends_at,
      bufferMinutes: hold.buffer_minutes,
      name: input.name,
      email: hold.email,
      phone: input.phone,
      quote,
      policyVersions: await currentPolicyVersions(tx),
      notes: input.notes,
      source: "online",
      idempotencyKey: input.idempotencyKey,
      holdId: hold.id,
    });

    await tx`UPDATE calendar_blocks SET kind = 'booking', booking_id = ${booking.id}, hold_id = NULL, expires_at = NULL WHERE id = ${block.id}`;
    await tx`UPDATE slot_holds SET converted_booking_id = ${booking.id} WHERE id = ${hold.id}`;
    await queueConfirmation(tx, settings, booking);
    await audit(tx, { type: "customer", id: customer.id }, "booking.created", "booking", booking.id, { details: { source: "online" } });
    return { bookingId: booking.id, reference: booking.reference, replayed: false };
  });
}

// ---------------------------------------------------------------------------

async function lockBooking(tx: Tx, id: number) {
  const [b] = await tx`SELECT * FROM bookings WHERE id = ${id} FOR UPDATE`;
  if (!b) throw new BookingError("Booking not found.", "not_found");
  return b;
}

function withinCutoff(settings: Settings, startsAt: Date) {
  return startsAt.getTime() - Date.now() < settings.customerChangeCutoffMinutes * 60_000;
}

export async function cancelBooking(
  bookingId: number,
  actor: Actor,
  opts: { reason?: string | null; overrideCutoff?: boolean; notifyCustomer?: boolean } = {},
) {
  const settings = await getSettings();
  return sql().begin(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status !== "confirmed") throw new BookingError("Only upcoming confirmed appointments can be cancelled.", "invalid");
    if (withinCutoff(settings, b.starts_at)) {
      if (actor.type !== "admin") {
        throw new BookingError(`Appointments can't be cancelled online within ${cutoffText(settings)} of the start time. Please get in touch.`, "cutoff");
      }
      if (!opts.overrideCutoff || !opts.reason?.trim()) {
        throw new BookingError("This is inside the cancellation cutoff. Tick override and give a reason to continue.", "cutoff");
      }
    }
    await tx`UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancellation_reason = ${opts.reason ?? null}, updated_at = now() WHERE id = ${b.id}`;
    await tx`DELETE FROM calendar_blocks WHERE booking_id = ${b.id}`;
    await tx`UPDATE promotion_redemptions SET status = 'released', updated_at = now() WHERE booking_id = ${b.id} AND status = 'reserved'`;
    await cancelPendingJobs(tx, b.id, ["booking_reminder", "booking_confirmation", "booking_rescheduled"]);
    if (opts.notifyCustomer !== false) {
      await enqueue(tx, { kind: "booking_cancelled", dedupeKey: `cancelled:${b.id}`, recipient: b.customer_email, bookingId: b.id });
    }
    if (actor.type !== "admin" && settings.notificationEmail) {
      await enqueue(tx, { kind: "admin_booking_changed", dedupeKey: `admin-cancelled:${b.id}`, recipient: settings.notificationEmail, bookingId: b.id, payload: { change: "cancelled" } });
    }
    await audit(tx, actor, "booking.cancelled", "booking", b.id, {
      reason: opts.reason,
      details: { overrideCutoff: !!opts.overrideCutoff && withinCutoff(settings, b.starts_at) },
    });
  });
}

function cutoffText(s: Settings) {
  const h = s.customerChangeCutoffMinutes / 60;
  return Number.isInteger(h) ? `${h} hours` : `${s.customerChangeCutoffMinutes} minutes`;
}

export type RescheduleOutcome =
  | { ok: true }
  | { ok: false; needsPriceConfirmation: { oldTotalPence: number; newTotalPence: number; reason: string } };

/**
 * Moves a booking atomically. The booking's own calendar block is updated in
 * place, so the exclusion constraint checks the new interval against every
 * other reservation; on any failure the transaction rolls back and the
 * original appointment is untouched.
 */
export async function rescheduleBooking(
  bookingId: number,
  newStart: Date,
  actor: Actor,
  opts: { reason?: string | null; overrideCutoff?: boolean; acceptPriceChange?: boolean; allowOutsideHours?: boolean } = {},
): Promise<RescheduleOutcome> {
  const settings = await getSettings();
  const db = sql();
  const [pre] = await db`SELECT * FROM bookings WHERE id = ${bookingId}`;
  if (!pre) throw new BookingError("Booking not found.", "not_found");
  const durationMs = pre.ends_at.getTime() - pre.starts_at.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  if (actor.type !== "admin") {
    // Customers may only choose a slot we'd currently offer (ignoring their own booking).
    const offered = await slotsForDate(settings, localDateOf(newStart, settings.timezone), durationMs / 60_000, { excludeBookingId: bookingId, technicianId: pre.technician_id });
    if (!offered.some((s) => s.startsAt === newStart.toISOString()))
      throw new BookingError("That time is no longer available. Please choose another.", "slot_taken");
  }

  try {
    return await db.begin(async (tx) => {
      const b = await lockBooking(tx, bookingId);
      if (b.status !== "confirmed") throw new BookingError("Only upcoming confirmed appointments can be moved.", "invalid");
      if (withinCutoff(settings, b.starts_at)) {
        if (actor.type !== "admin")
          throw new BookingError(`Appointments can't be changed online within ${cutoffText(settings)} of the start time. Please get in touch.`, "cutoff");
        if (!opts.overrideCutoff || !opts.reason?.trim())
          throw new BookingError("This is inside the change cutoff. Tick override and give a reason to continue.", "cutoff");
      }
      if (!opts.allowOutsideHours && !(await holdStillFits(b.technician_id, newStart, newEnd, settings.timezone, tx)))
        throw new BookingError("The new time is outside working hours.", "invalid");

      // Promotion appointment-date restrictions.
      const [red] = await tx`SELECT * FROM promotion_redemptions WHERE booking_id = ${b.id} AND status = 'reserved'`;
      let newDiscount = b.discount_pence as number;
      let priceNote: string | null = null;
      if (red) {
        const promo = await loadPromotion(tx, red.promotion_id);
        const date = localDateOf(newStart, settings.timezone);
        const outside = promo && ((promo.appointmentFrom && date < promo.appointmentFrom) || (promo.appointmentUntil && date > promo.appointmentUntil));
        if (outside) {
          newDiscount = 0;
          priceNote = `${promo!.name} only applies to appointments ${promo!.appointmentFrom ? `from ${promo!.appointmentFrom} ` : ""}${promo!.appointmentUntil ? `until ${promo!.appointmentUntil}` : ""}`.trim();
          if (!opts.acceptPriceChange) {
            return { ok: false as const, needsPriceConfirmation: { oldTotalPence: b.total_pence, newTotalPence: b.subtotal_pence, reason: priceNote } };
          }
          await tx`UPDATE promotion_redemptions SET status = 'released', updated_at = now() WHERE id = ${red.id}`;
        }
      }

      await tx`
        UPDATE calendar_blocks SET period = tstzrange(${newStart}, ${new Date(newEnd.getTime() + b.buffer_minutes * 60_000)})
        WHERE booking_id = ${b.id}`;
      await tx`
        UPDATE bookings SET starts_at = ${newStart}, ends_at = ${newEnd},
          discount_pence = ${newDiscount}, total_pence = subtotal_pence - ${newDiscount},
          promotion_id = ${newDiscount === b.discount_pence ? b.promotion_id : null},
          needs_review = false, review_reason = NULL, updated_at = now()
        WHERE id = ${b.id}`;
      await cancelPendingJobs(tx, b.id, ["booking_reminder"]);
      await scheduleReminder(tx, { id: b.id, startsAt: newStart, email: b.customer_email }, settings.reminderLeadMinutes, settings.remindersEnabled);
      await enqueue(tx, {
        kind: "booking_rescheduled",
        dedupeKey: `rescheduled:${b.id}:${newStart.toISOString()}`,
        recipient: b.customer_email,
        bookingId: b.id,
      });
      if (actor.type !== "admin" && settings.notificationEmail) {
        await enqueue(tx, { kind: "admin_booking_changed", dedupeKey: `admin-rescheduled:${b.id}:${newStart.toISOString()}`, recipient: settings.notificationEmail, bookingId: b.id, payload: { change: "rescheduled" } });
      }
      await audit(tx, actor, "booking.rescheduled", "booking", b.id, {
        reason: opts.reason,
        details: { from: b.starts_at.toISOString(), to: newStart.toISOString(), priceNote },
      });
      return { ok: true as const };
    });
  } catch (err) {
    if (pgCode(err) === PG_EXCLUSION_VIOLATION)
      throw new BookingError("That time overlaps another appointment. Your original time is unchanged.", "slot_taken");
    throw err;
  }
}

/** Admin-created booking. Overlaps are rejected by the database, never silently overridden. */
export async function createManualBooking(
  adminId: number,
  input: {
    name: string;
    email: string;
    phone: string | null;
    treatmentId: number;
    extraIds: number[];
    startsAt: Date;
    notes: string | null;
    code: string | null;
    manualDiscount: { pence: number; reason: string } | null;
    sendConfirmation: boolean;
    allowOutsideHours: boolean;
  },
) {
  const settings = await getSettings();
  const technicianId = await defaultTechnicianId();
  const lines: PriceLine[] = await resolveSelection(input.treatmentId, input.extraIds);
  const duration = totalDuration(lines);
  const endsAt = new Date(input.startsAt.getTime() + duration * 60_000);
  try {
    return await sql().begin(async (tx) => {
      if (!input.allowOutsideHours && !(await holdStillFits(technicianId, input.startsAt, endsAt, settings.timezone, tx)))
        throw new BookingError("That time is outside working hours. Tick 'allow outside hours' to book it anyway.", "invalid");
      const customer = await upsertCustomerForUpdate(tx, { email: input.email, name: input.name, phone: input.phone, verified: false });
      const quote = await quoteBooking(tx, {
        lines,
        appointmentLocalDate: localDateOf(input.startsAt, settings.timezone),
        code: input.code,
        customer: { id: customer.id, phoneNormalised: normalisePhone(input.phone) },
        lock: true,
      });
      if (input.code && quote.codeResult && !quote.codeResult.ok) throw new BookingError(quote.codeResult.message, "invalid");
      if (input.manualDiscount) {
        if (input.manualDiscount.pence < 0 || input.manualDiscount.pence > quote.subtotalPence)
          throw new BookingError("Manual discount must be between £0 and the booking subtotal.", "invalid");
        if (!input.manualDiscount.reason.trim()) throw new BookingError("Give a reason for the manual discount.", "invalid");
      }
      const booking = await insertBooking(tx, {
        technicianId, customerId: customer.id, startsAt: input.startsAt, endsAt, bufferMinutes: settings.bufferMinutes,
        name: input.name, email: input.email.trim().toLowerCase(), phone: input.phone, quote,
        policyVersions: await currentPolicyVersions(tx), notes: input.notes, source: "admin",
        idempotencyKey: null, holdId: null, manualDiscount: input.manualDiscount,
      });
      await tx`
        INSERT INTO calendar_blocks (technician_id, period, kind, booking_id)
        VALUES (${technicianId}, tstzrange(${input.startsAt}, ${new Date(endsAt.getTime() + settings.bufferMinutes * 60_000)}), 'booking', ${booking.id})`;
      if (input.sendConfirmation) {
        await enqueue(tx, { kind: "booking_confirmation", dedupeKey: `confirmation:${booking.id}`, recipient: booking.customer_email, bookingId: booking.id });
      }
      await scheduleReminder(tx, { id: booking.id, startsAt: booking.starts_at, email: booking.customer_email }, settings.reminderLeadMinutes, settings.remindersEnabled && input.sendConfirmation);
      await audit(tx, { type: "admin", id: adminId }, "booking.created", "booking", booking.id, {
        reason: input.manualDiscount?.reason,
        details: { source: "admin", manualDiscountPence: input.manualDiscount?.pence ?? null, outsideHours: input.allowOutsideHours },
      });
      return { bookingId: booking.id as number, reference: booking.reference as string };
    });
  } catch (err) {
    if (pgCode(err) === PG_EXCLUSION_VIOLATION)
      throw new BookingError("That time overlaps another appointment or an active checkout. Choose a different time.", "slot_taken");
    throw err;
  }
}

export async function setBookingStatus(
  bookingId: number,
  status: "completed" | "no_show",
  adminId: number,
  opts: { reason?: string | null; sendReviewInvite?: boolean } = {},
) {
  await sql().begin(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status === "cancelled") throw new BookingError("Cancelled appointments can't change status.", "invalid");
    if (b.status === status) return;
    if (b.status !== "confirmed" && !opts.reason?.trim()) throw new BookingError("Give a reason when correcting a recorded status.", "invalid");
    await tx`UPDATE bookings SET status = ${status}, updated_at = now() WHERE id = ${b.id}`;
    await tx`
      UPDATE promotion_redemptions SET status = ${status === "completed" ? "consumed" : "forfeited"}, updated_at = now()
      WHERE booking_id = ${b.id} AND status IN ('reserved','consumed','forfeited')`;
    await cancelPendingJobs(tx, b.id, ["booking_reminder"]);
    if (status === "completed" && opts.sendReviewInvite) {
      await enqueue(tx, { kind: "review_invite", dedupeKey: `review-invite:${b.id}`, recipient: b.customer_email, bookingId: b.id });
    }
    await audit(tx, { type: "admin", id: adminId }, `booking.${status}`, "booking", b.id, { reason: opts.reason, details: { from: b.status } });
  });
}

export async function recordPayment(bookingId: number, adminId: number, pence: number, method: string) {
  await sql().begin(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.status === "cancelled") throw new BookingError("Can't record payment for a cancelled appointment.", "invalid");
    await tx`UPDATE bookings SET payment_received_pence = ${pence}, payment_method = ${method}, payment_recorded_at = now(), updated_at = now() WHERE id = ${b.id}`;
    await audit(tx, { type: "admin", id: adminId }, "booking.payment_recorded", "booking", b.id, { details: { pence, method, expected: b.total_pence } });
  });
}

/** Flags future confirmed bookings that no longer fit working hours. Never moves or cancels them. */
export async function flagScheduleConflicts(db: Db = sql()): Promise<number> {
  const settings = await getSettings(db);
  const rows = await db`SELECT id, technician_id, starts_at, ends_at, needs_review FROM bookings WHERE status = 'confirmed' AND starts_at > now()`;
  let flagged = 0;
  for (const b of rows) {
    const fits = await holdStillFits(b.technician_id, b.starts_at, b.ends_at, settings.timezone, db);
    if (!fits) {
      flagged++;
      if (!b.needs_review)
        await db`UPDATE bookings SET needs_review = true, review_reason = 'Outside current working hours after a schedule change' WHERE id = ${b.id}`;
    } else if (b.needs_review) {
      await db`UPDATE bookings SET needs_review = false, review_reason = NULL WHERE id = ${b.id} AND review_reason LIKE 'Outside current working hours%'`;
    }
  }
  return flagged;
}

/** Flags future bookings whose snapshot duration differs from the treatment's current duration. */
export async function flagDurationChanges(treatmentId: number, db: Db = sql()) {
  await db`
    UPDATE bookings b SET needs_review = true,
      review_reason = 'Treatment duration has changed since this booking was made (booking keeps its original time)'
    FROM booking_items bi JOIN treatments t ON t.id = bi.treatment_id
    WHERE bi.booking_id = b.id AND bi.kind = 'treatment' AND bi.treatment_id = ${treatmentId}
      AND b.status = 'confirmed' AND b.starts_at > now() AND bi.duration_minutes <> t.duration_minutes`;
}

