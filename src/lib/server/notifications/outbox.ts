import "server-only";
import type { Db } from "../db";

export type JobKind =
  | "verify_email"
  | "customer_login_code"
  | "booking_confirmation"
  | "booking_reminder"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "admin_new_booking"
  | "admin_booking_changed"
  | "review_invite"
  | "enquiry_received"
  | "admin_password_reset";

/**
 * Adds a message to the durable outbox inside the caller's transaction, so a
 * booking and its emails commit (or roll back) together. `dedupeKey` makes the
 * same logical message idempotent.
 */
export async function enqueue(
  db: Db,
  job: {
    kind: JobKind;
    dedupeKey: string;
    recipient: string;
    payload?: Record<string, unknown>;
    bookingId?: number | null;
    runAt?: Date;
  },
): Promise<number | null> {
  const [r] = await db`
    INSERT INTO notification_jobs (kind, dedupe_key, recipient, payload, booking_id, run_at)
    VALUES (${job.kind}, ${job.dedupeKey}, ${job.recipient}, ${db.json((job.payload ?? {}) as never)},
            ${job.bookingId ?? null}, ${job.runAt ?? new Date()})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;
  return r?.id ?? null;
}

/** Cancels not-yet-sent jobs for a booking (e.g. reminders after cancel/reschedule). */
export async function cancelPendingJobs(db: Db, bookingId: number, kinds: JobKind[]) {
  await db`
    UPDATE notification_jobs SET status = 'cancelled', updated_at = now()
    WHERE booking_id = ${bookingId} AND kind IN ${db(kinds)} AND status IN ('pending','failed')`;
}

/** Schedules the reminder unless its send time has already passed. */
export async function scheduleReminder(
  db: Db,
  b: { id: number; startsAt: Date; email: string },
  leadMinutes: number,
  enabled: boolean,
) {
  if (!enabled) return;
  const runAt = new Date(b.startsAt.getTime() - leadMinutes * 60_000);
  if (runAt.getTime() <= Date.now()) return; // short notice: the confirmation covers it
  await enqueue(db, {
    kind: "booking_reminder",
    dedupeKey: `reminder:${b.id}:${b.startsAt.toISOString()}`,
    recipient: b.email,
    bookingId: b.id,
    payload: { startsAt: b.startsAt.toISOString() },
    runAt,
  });
}
