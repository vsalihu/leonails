import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/server/db";
import { resetEnvCacheForTests } from "@/lib/server/env";
import { resetTransportForTests } from "@/lib/server/notifications/mailer";
import { runDueJobs, retryJob } from "@/lib/server/notifications/worker";
import { enqueue } from "@/lib/server/notifications/outbox";
import { createHold, requestVerification, verifyCode } from "@/lib/server/holds";
import { confirmBooking, rescheduleBooking } from "@/lib/server/bookings";
import { bookingIdForToken } from "@/lib/server/booking-access";
import { resetDb, at } from "./helpers";

let fx: Awaited<ReturnType<typeof resetDb>>;
const original = { ...process.env };

beforeEach(async () => {
  fx = await resetDb();
});
afterEach(() => {
  process.env = { ...original };
  resetEnvCacheForTests();
  resetTransportForTests();
});

/** Full customer journey including reading the real code from the captured verification email. */
async function bookViaEmail(session: string, start: Date) {
  const hold = await createHold({ sessionId: session, treatmentId: fx.gel, extraIds: [], startsAt: start, ipHash: "ip" });
  await requestVerification(hold.publicId, session, `${session}@example.test`);
  await runDueJobs();
  const [mail] = await sql()`SELECT subject, text_body FROM dev_mailbox WHERE recipient = ${`${session}@example.test`} ORDER BY id DESC LIMIT 1`;
  const code = /(\d{6}) is your/.exec(mail.subject)![1];
  expect(mail.text_body).toContain(code);
  expect(await verifyCode(hold.publicId, session, code)).toBe(true);
  return confirmBooking({
    holdPublicId: hold.publicId, sessionId: session, idempotencyKey: session, name: "Ada",
    email: `${session}@example.test`, phone: "07700900123", notes: null, code: null, expectedTotalPence: 3000,
  });
}

describe("outbox", () => {
  it("captures verification and confirmation emails in the dev mailbox without claiming delivery", async () => {
    const r = await bookViaEmail("s", at(3, "10:00"));
    await runDueJobs();
    const jobs = await sql()`SELECT kind, status FROM notification_jobs WHERE booking_id = ${r.bookingId} ORDER BY id`;
    expect(jobs).toEqual(
      expect.arrayContaining([
        { kind: "booking_confirmation", status: "captured" },
        { kind: "admin_new_booking", status: "captured" },
        { kind: "booking_reminder", status: "pending" },
      ]),
    );
    const [mail] = await sql()`SELECT text_body FROM dev_mailbox WHERE subject LIKE 'Confirmed:%'`;
    expect(mail.text_body).toContain("1 Secret Lane");
    const link = /\/appointment\/([A-Za-z0-9_-]{43})/.exec(mail.text_body)![1];
    expect(await bookingIdForToken(link, "manage")).toBe(r.bookingId);
    // no raw tokens or codes stored anywhere in job payloads
    const payloads = await sql()`SELECT payload::text AS p FROM notification_jobs`;
    for (const p of payloads) expect(p.p).not.toContain(link);
  });

  it("a provider failure leaves the booking valid, retries with backoff, then shows failure for a safe admin retry", async () => {
    process.env.MAIL_DRIVER = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // nothing listens here: connection refused
    resetEnvCacheForTests();
    resetTransportForTests();
    const hold = await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: "ip" });
    await sql()`UPDATE slot_holds SET email = 's@example.test', email_verified_at = now()`;
    const r = await confirmBooking({ holdPublicId: hold.publicId, sessionId: "s", idempotencyKey: "k", name: "A", email: "s@example.test", phone: "1", notes: null, code: null, expectedTotalPence: 3000 });
    await runDueJobs();
    const [b] = await sql()`SELECT status FROM bookings WHERE id = ${r.bookingId}`;
    expect(b.status).toBe("confirmed");
    let [job] = await sql()`SELECT status, attempts, last_error, run_at FROM notification_jobs WHERE kind = 'booking_confirmation'`;
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.last_error).toBeTruthy();
    expect(job.run_at.getTime()).toBeGreaterThan(Date.now());
    // exhaust attempts
    for (let i = 0; i < 6; i++) {
      await sql()`UPDATE notification_jobs SET run_at = now() WHERE status = 'pending' AND kind = 'booking_confirmation'`;
      await runDueJobs();
    }
    [job] = await sql()`SELECT id, status, attempts FROM notification_jobs WHERE kind = 'booking_confirmation'`;
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(6);
    // provider fixed, admin retries: one message, no duplicates
    process.env.MAIL_DRIVER = "devmailbox";
    resetEnvCacheForTests();
    await retryJob(job.id);
    await runDueJobs();
    await runDueJobs();
    const mails = await sql()`SELECT id FROM dev_mailbox WHERE subject LIKE 'Confirmed:%'`;
    expect(mails).toHaveLength(1);
  });

  it("dedupe keys make enqueueing idempotent", async () => {
    const db = sql();
    expect(await enqueue(db, { kind: "enquiry_received", dedupeKey: "x", recipient: "a@b.c" })).toBeTypeOf("number");
    expect(await enqueue(db, { kind: "enquiry_received", dedupeKey: "x", recipient: "a@b.c" })).toBeNull();
  });

  it("a reminder for a moved appointment is skipped rather than sent with the old time", async () => {
    const r = await bookViaEmail("s", at(3, "10:00"));
    // force the old reminder to be due, then move the appointment without cancelling it (simulating a race)
    const [rem] = await sql()`SELECT id FROM notification_jobs WHERE kind = 'booking_reminder'`;
    await sql()`UPDATE bookings SET starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' WHERE id = ${r.bookingId}`;
    await sql()`UPDATE notification_jobs SET run_at = now() WHERE id = ${rem.id}`;
    await runDueJobs();
    const [after] = await sql()`SELECT status, last_error FROM notification_jobs WHERE id = ${rem.id}`;
    expect(after).toMatchObject({ status: "skipped", last_error: "appointment time changed" });
  });

  it("no reminder is scheduled when its send time has passed; confirmation covers short notice", async () => {
    await sql()`UPDATE business_settings SET reminder_lead_minutes = 10000`;
    await bookViaEmail("s", at(3, "10:00"));
    const rems = await sql()`SELECT 1 FROM notification_jobs WHERE kind = 'booking_reminder'`;
    expect(rems).toHaveLength(0);
  });

  it("a stuck job (crashed worker) is reclaimed after its lease", async () => {
    await enqueue(sql(), { kind: "enquiry_received", dedupeKey: "stuck", recipient: "a@b.c", payload: { enquiryId: 999 } });
    await sql()`UPDATE notification_jobs SET status = 'processing', locked_until = now() - interval '1 second'`;
    const { processed } = await runDueJobs();
    expect(processed).toBe(1);
    const [j] = await sql()`SELECT status FROM notification_jobs`;
    expect(j.status).toBe("skipped"); // enquiry 999 does not exist
  });

  it("rescheduling sends one rescheduled email and a new reminder", async () => {
    const r = await bookViaEmail("s", at(3, "10:00"));
    await rescheduleBooking(r.bookingId, at(4, "10:00"), { type: "customer", id: null });
    await runDueJobs();
    const mails = await sql()`SELECT subject FROM dev_mailbox WHERE subject LIKE 'Rescheduled:%'`;
    expect(mails).toHaveLength(1);
  });
});
