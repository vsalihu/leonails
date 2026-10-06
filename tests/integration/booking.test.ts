import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "@/lib/server/db";
import { createHold, requestVerification, verifyCode, BookingError, getHold } from "@/lib/server/holds";
import { confirmBooking, cancelBooking, rescheduleBooking, createManualBooking, setBookingStatus, flagScheduleConflicts } from "@/lib/server/bookings";
import { bookingIdForToken, customerBookingView, mintManageToken } from "@/lib/server/booking-access";
import { quoteBooking } from "@/lib/server/promotions";
import { resolveSelection } from "@/lib/server/catalogue";
import { getSettings } from "@/lib/server/settings";
import { slotsForDate } from "@/lib/server/schedule";
import { resetDb, at, localDate, codeFor } from "./helpers";

let fx: Awaited<ReturnType<typeof resetDb>>;
beforeEach(async () => {
  fx = await resetDb();
});

const IP = "test-ip";

async function verifiedHold(session: string, startsAt: Date, treatmentId = fx.gel, extraIds: number[] = [], email = `${session}@example.test`) {
  const hold = await createHold({ sessionId: session, treatmentId, extraIds, startsAt, ipHash: IP });
  await requestVerification(hold.publicId, session, email);
  const [{ id }] = await sql()`SELECT id FROM slot_holds WHERE public_id = ${hold.publicId}`;
  const code = await codeFor(id);
  expect(await verifyCode(hold.publicId, session, code)).toBe(true);
  return { hold, email, holdId: id as number };
}

async function expectedTotal(treatmentId: number, extraIds: number[], startsAt: Date, code: string | null, email: string) {
  const db = sql();
  const lines = await resolveSelection(treatmentId, extraIds);
  const [c] = await db`SELECT id, phone_normalised FROM customers WHERE email = ${email}`;
  const q = await quoteBooking(db, {
    lines,
    appointmentLocalDate: startsAt.toISOString().slice(0, 10),
    code,
    customer: { id: c?.id ?? null, phoneNormalised: c?.phone_normalised ?? null },
  });
  return q.totalPence;
}

async function book(session: string, startsAt: Date, opts: { treatmentId?: number; extraIds?: number[]; code?: string | null; key?: string } = {}) {
  const treatmentId = opts.treatmentId ?? fx.gel;
  const extraIds = opts.extraIds ?? [];
  const { hold, email } = await verifiedHold(session, startsAt, treatmentId, extraIds);
  const total = await expectedTotal(treatmentId, extraIds, startsAt, opts.code ?? null, email);
  return confirmBooking({
    holdPublicId: hold.publicId, sessionId: session, idempotencyKey: opts.key ?? `key-${session}`,
    name: "Test Customer", email, phone: "07700 900123", notes: null, code: opts.code ?? null, expectedTotalPence: total,
  });
}

describe("holds and double-booking protection", () => {
  it("two customers reserving the same interval concurrently: exactly one succeeds, the other gets alternatives", async () => {
    const start = at(3, "10:00");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createHold({ sessionId: `s${i}`, treatmentId: fx.gel, extraIds: [], startsAt: start, ipHash: IP })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(5);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(BookingError);
      expect(f.reason.code).toBe("slot_taken");
      const alts = (f.reason.data as { alternatives: { startsAt: string }[] }).alternatives;
      expect(alts.length).toBeGreaterThan(0);
      expect(alts.every((a) => a.startsAt !== start.toISOString())).toBe(true);
    }
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM calendar_blocks`;
    expect(n).toBe(1);
  });

  it("the database rejects overlapping reservations even if application checks are bypassed", async () => {
    await book("a", at(3, "10:00"));
    const [h] = await sql()`
      INSERT INTO slot_holds (session_id, technician_id, starts_at, ends_at, buffer_minutes, treatment_id, expires_at)
      VALUES ('x', ${fx.technicianId}, ${at(3, "10:30")}, ${at(3, "11:30")}, 15, ${fx.gel}, now() + interval '5 min') RETURNING id`;
    await expect(
      sql()`INSERT INTO calendar_blocks (technician_id, period, kind, hold_id, expires_at)
            VALUES (${fx.technicianId}, tstzrange(${at(3, "10:30")}, ${at(3, "11:30")}), 'hold', ${h.id}, now() + interval '5 min')`,
    ).rejects.toMatchObject({ code: "23P01" });
  });

  it("a duration-increasing extra changes availability and the occupied interval", async () => {
    const settings = await getSettings();
    const base = (await slotsForDate(settings, localDate(3), 60)).map((s) => s.label);
    const longer = (await slotsForDate(settings, localDate(3), 75)).map((s) => s.label);
    expect(base).toContain("11:30"); // 11:30-12:30 fits before lunch
    expect(longer).not.toContain("11:30"); // 11:30-12:45 overlaps lunch
    const { hold } = await verifiedHold("x", at(3, "10:00"), fx.gel, [fx.french]);
    const [b] = await sql()`SELECT lower(period) AS s, upper(period) AS e FROM calendar_blocks WHERE hold_id = (SELECT id FROM slot_holds WHERE public_id = ${hold.publicId})`;
    expect((b.e.getTime() - b.s.getTime()) / 60000).toBe(60 + 15 + 15); // service + extra + buffer
  });

  it("availability excludes live holds and bookings (including their buffers) but not expired holds", async () => {
    const settings = await getSettings();
    const labels = async () => (await slotsForDate(settings, localDate(3), 60)).map((s) => s.label);
    await book("a", at(3, "10:00")); // occupies 10:00-11:15 incl. buffer
    await createHold({ sessionId: "h", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "14:00"), ipHash: IP });
    let l = await labels();
    for (const t of ["09:00", "09:45", "10:00", "11:00", "13:45", "14:00", "15:00"]) expect(l).not.toContain(t);
    for (const t of ["11:15", "15:15"]) expect(l).toContain(t);
    await sql()`UPDATE calendar_blocks SET expires_at = now() - interval '1 second' WHERE kind = 'hold'`;
    l = await labels();
    expect(l).toContain("14:00");
    expect(l).not.toContain("10:00");
  });

  it("an appointment overlapping a break or closing time is unavailable", async () => {
    await expect(createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "12:00"), ipHash: IP })).rejects.toMatchObject({ code: "slot_taken" });
    await expect(createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "16:30"), ipHash: IP })).rejects.toMatchObject({ code: "slot_taken" });
    await expect(createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:07"), ipHash: IP })).rejects.toMatchObject({ code: "slot_taken" });
  });

  it("a session holds one interval at a time (anti-hoarding)", async () => {
    await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: IP });
    await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "14:00"), ipHash: IP });
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM calendar_blocks`;
    expect(n).toBe(1);
    // and the session may move to a nearby, overlapping time
    await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "14:15"), ipHash: IP });
  });

  it("a hold that expires during checkout fails safely and frees the time", async () => {
    const { hold, email } = await verifiedHold("s", at(3, "10:00"));
    await sql()`UPDATE slot_holds SET expires_at = now() - interval '1 second'`;
    await sql()`UPDATE calendar_blocks SET expires_at = now() - interval '1 second'`;
    await expect(
      confirmBooking({ holdPublicId: hold.publicId, sessionId: "s", idempotencyKey: "k", name: "A", email, phone: "1", notes: null, code: null, expectedTotalPence: 3000 }),
    ).rejects.toMatchObject({ code: "hold_expired" });
    // Someone else can now take it, even before cleanup has run.
    await createHold({ sessionId: "other", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: IP });
    expect(await getHold(hold.publicId, "s")).toBeNull();
  });
});

describe("confirmation", () => {
  it("double-clicking confirm creates one booking and one confirmation job", async () => {
    const { hold, email } = await verifiedHold("s", at(3, "10:00"));
    const input = { holdPublicId: hold.publicId, sessionId: "s", name: "A", email, phone: "07700900123", notes: null, code: null, expectedTotalPence: 3000 };
    const results = await Promise.all([
      confirmBooking({ ...input, idempotencyKey: "same" }),
      confirmBooking({ ...input, idempotencyKey: "same" }),
      confirmBooking({ ...input, idempotencyKey: "different-tab" }),
    ]);
    expect(new Set(results.map((r) => r.bookingId)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM bookings`;
    expect(n).toBe(1);
    const jobs = await sql()`SELECT kind FROM notification_jobs WHERE kind = 'booking_confirmation'`;
    expect(jobs).toHaveLength(1);
  });

  it("requires a verified email", async () => {
    const hold = await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: IP });
    await expect(
      confirmBooking({ holdPublicId: hold.publicId, sessionId: "s", idempotencyKey: "k", name: "A", email: "a@example.test", phone: "1", notes: null, code: null, expectedTotalPence: 3000 }),
    ).rejects.toMatchObject({ code: "not_verified" });
  });

  it("wrong codes are limited", async () => {
    const hold = await createHold({ sessionId: "s", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: IP });
    await requestVerification(hold.publicId, "s", "a@example.test");
    const [{ id }] = await sql()`SELECT id FROM slot_holds`;
    await codeFor(id);
    for (let i = 0; i < 5; i++) expect(await verifyCode(hold.publicId, "s", "000000")).toBe(false);
    await expect(verifyCode(hold.publicId, "s", "123456")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("a submitted price that differs from the server's is rejected with the authoritative quote", async () => {
    const { hold, email } = await verifiedHold("s", at(3, "10:00"), fx.gel, [fx.french]);
    const err = await confirmBooking({ holdPublicId: hold.publicId, sessionId: "s", idempotencyKey: "k", name: "A", email, phone: "1", notes: null, code: null, expectedTotalPence: 100 }).catch((e) => e);
    expect(err).toMatchObject({ code: "price_changed" });
    expect(err.data.quote.totalPence).toBe(3500);
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM bookings`;
    expect(n).toBe(0);
  });

  it("stores immutable snapshots that survive later catalogue and promotion edits", async () => {
    await sql()`INSERT INTO promotions (name, code, application, discount_type, percent_off) VALUES ('Spring', 'SPRING10', 'code', 'percent', 10)`;
    const r = await book("s", at(3, "10:00"), { extraIds: [fx.french], code: "spring10" });
    await sql()`UPDATE treatments SET name = 'Renamed', price_pence = 9999, duration_minutes = 120`;
    await sql()`UPDATE promotions SET percent_off = 50, name = 'Changed'`;
    const view = (await customerBookingView(r.bookingId))!;
    expect(view.items.map((i) => [i.name, i.pricePence])).toEqual([["Gel manicure", 3000], ["French finish", 500]]);
    expect(view.subtotalPence).toBe(3500);
    expect(view.discountPence).toBe(350);
    expect(view.totalPence).toBe(3150);
    expect(view.promotionName).toBe("Spring");
  });
});

describe("promotions", () => {
  it("the last redemption cannot be exceeded under concurrency", async () => {
    await sql()`INSERT INTO promotions (name, code, application, discount_type, percent_off, usage_limit) VALUES ('One left', 'LAST', 'code', 'percent', 20, 1)`;
    const a = await verifiedHold("a", at(3, "10:00"));
    const b = await verifiedHold("b", at(3, "14:00"));
    const confirm = (h: typeof a, s: string) =>
      confirmBooking({ holdPublicId: h.hold.publicId, sessionId: s, idempotencyKey: s, name: "X", email: h.email, phone: "1", notes: null, code: "LAST", expectedTotalPence: 2400 });
    const results = await Promise.allSettled([confirm(a, "a"), confirm(b, "b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("price_changed");
    expect(rejected.reason.data.quote.codeResult.message).toMatch(/fully redeemed/);
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM promotion_redemptions WHERE status = 'reserved'`;
    expect(n).toBe(1);
  });

  it("ineligible or expired offers give a clear reason and no discount", async () => {
    const db = sql();
    await db`INSERT INTO promotions (name, code, application, discount_type, percent_off, redeem_until) VALUES ('Old', 'OLD', 'code', 'percent', 20, now() - interval '1 day')`;
    await db`INSERT INTO promotions (name, code, application, discount_type, amount_off_pence, min_spend_pence) VALUES ('Big spend', 'BIG', 'code', 'fixed', 1000, 5000)`;
    const lines = await resolveSelection(fx.gel, []);
    const q1 = await quoteBooking(db, { lines, appointmentLocalDate: localDate(3), code: "old", customer: null });
    expect(q1.codeResult).toMatchObject({ ok: false, message: "This offer has expired." });
    expect(q1.discountPence).toBe(0);
    const q2 = await quoteBooking(db, { lines, appointmentLocalDate: localDate(3), code: "BIG", customer: null });
    expect(q2.codeResult?.message).toMatch(/minimum spend of £50/);
    const q3 = await quoteBooking(db, { lines, appointmentLocalDate: localDate(3), code: "NOPE", customer: null });
    expect(q3.codeResult?.message).toMatch(/don't recognise/);
  });

  it("first-visit offers are refused after a completed appointment", async () => {
    await sql()`INSERT INTO promotions (name, code, application, discount_type, percent_off, eligibility, per_customer_limit) VALUES ('Welcome', 'WELCOME20', 'code', 'percent', 20, 'first_visit', 1)`;
    const first = await book("s", at(3, "10:00"), { code: "WELCOME20" });
    expect((await customerBookingView(first.bookingId))!.discountPence).toBe(600);
    // second booking while the first redemption is active: not eligible
    const { hold, email } = await verifiedHold("s", at(4, "10:00"));
    const lines = await resolveSelection(fx.gel, []);
    const [c] = await sql()`SELECT id FROM customers WHERE email = ${email}`;
    const q = await quoteBooking(sql(), { lines, appointmentLocalDate: localDate(4), code: "WELCOME20", customer: { id: c.id, phoneNormalised: null } });
    expect(q.codeResult?.ok).toBe(false);
    expect(q.discountPence).toBe(0);
    void hold;
  });

  it("cancellation releases an unused redemption", async () => {
    await sql()`INSERT INTO promotions (name, code, application, discount_type, percent_off, usage_limit) VALUES ('One', 'ONE', 'code', 'percent', 10, 1)`;
    const r = await book("s", at(3, "10:00"), { code: "ONE" });
    await cancelBooking(r.bookingId, { type: "customer", id: null });
    const [red] = await sql()`SELECT status FROM promotion_redemptions`;
    expect(red.status).toBe("released");
    const lines = await resolveSelection(fx.gel, []);
    const q = await quoteBooking(sql(), { lines, appointmentLocalDate: localDate(3), code: "ONE", customer: null });
    expect(q.codeResult?.ok).toBe(true);
  });
});

describe("lifecycle", () => {
  it("cancellation releases the interval and suppresses the reminder", async () => {
    const r = await book("s", at(3, "10:00"));
    const [rem] = await sql()`SELECT status FROM notification_jobs WHERE kind = 'booking_reminder'`;
    expect(rem.status).toBe("pending");
    await cancelBooking(r.bookingId, { type: "customer", id: null });
    const [rem2] = await sql()`SELECT status FROM notification_jobs WHERE kind = 'booking_reminder'`;
    expect(rem2.status).toBe("cancelled");
    const [{ n }] = await sql()`SELECT count(*)::int AS n FROM calendar_blocks`;
    expect(n).toBe(0);
    await createHold({ sessionId: "next", treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:00"), ipHash: IP });
  });

  it("customers can't cancel inside the cutoff; admins can with an explicit override and reason", async () => {
    const r = await book("s", at(3, "10:00"));
    await sql()`UPDATE business_settings SET customer_change_cutoff_minutes = 10000`;
    await expect(cancelBooking(r.bookingId, { type: "customer", id: null })).rejects.toMatchObject({ code: "cutoff" });
    await expect(cancelBooking(r.bookingId, { type: "admin", id: 1 })).rejects.toMatchObject({ code: "cutoff" });
    await sql()`INSERT INTO admin_users (id, email, name, password_hash) VALUES (1, 'a@x.test', 'A', 'x')`;
    await cancelBooking(r.bookingId, { type: "admin", id: 1 }, { overrideCutoff: true, reason: "Client called" });
    const [a] = await sql()`SELECT reason, details FROM audit_events WHERE action = 'booking.cancelled'`;
    expect(a.reason).toBe("Client called");
    expect(a.details.overrideCutoff).toBe(true);
  });

  it("rescheduling to an unavailable time keeps the original appointment", async () => {
    const mine = await book("a", at(3, "10:00"));
    await book("b", at(3, "14:00"));
    await expect(rescheduleBooking(mine.bookingId, at(3, "14:00"), { type: "customer", id: null })).rejects.toMatchObject({ code: "slot_taken" });
    await expect(rescheduleBooking(mine.bookingId, at(3, "14:30"), { type: "admin", id: 1 })).rejects.toMatchObject({ code: "slot_taken" });
    const [b] = await sql()`SELECT starts_at, status FROM bookings WHERE id = ${mine.bookingId}`;
    expect(b.starts_at.toISOString()).toBe(at(3, "10:00").toISOString());
    expect(b.status).toBe("confirmed");
  });

  it("rescheduling moves the interval atomically, including within its own current interval", async () => {
    const r = await book("a", at(3, "10:00"));
    const out = await rescheduleBooking(r.bookingId, at(3, "10:30"), { type: "customer", id: null });
    expect(out.ok).toBe(true);
    const [blk] = await sql()`SELECT lower(period) AS s FROM calendar_blocks WHERE booking_id = ${r.bookingId}`;
    expect(blk.s.toISOString()).toBe(at(3, "10:30").toISOString());
    const reminders = await sql()`SELECT status, payload->>'startsAt' AS s FROM notification_jobs WHERE kind = 'booking_reminder' ORDER BY id`;
    expect(reminders.map((x) => x.status)).toEqual(["cancelled", "pending"]);
    expect(reminders[1].s).toBe(at(3, "10:30").toISOString());
  });

  it("admin manual bookings cannot silently overlap", async () => {
    await book("a", at(3, "10:00"));
    await sql()`INSERT INTO admin_users (id, email, name, password_hash) VALUES (1, 'a@x.test', 'A', 'x')`;
    await expect(
      createManualBooking(1, { name: "Walk in", email: "w@example.test", phone: null, treatmentId: fx.gel, extraIds: [], startsAt: at(3, "10:45"), notes: null, code: null, manualDiscount: null, sendConfirmation: false, allowOutsideHours: false }),
    ).rejects.toMatchObject({ code: "slot_taken" });
    const ok = await createManualBooking(1, { name: "Walk in", email: "w@example.test", phone: null, treatmentId: fx.gel, extraIds: [], startsAt: at(3, "13:15"), notes: null, code: null, manualDiscount: { pence: 500, reason: "Loyal client" }, sendConfirmation: false, allowOutsideHours: false });
    const [b] = await sql()`SELECT total_pence, manual_discount_reason FROM bookings WHERE id = ${ok.bookingId}`;
    expect(b).toMatchObject({ total_pence: 2500, manual_discount_reason: "Loyal client" });
  });

  it("changing working hours flags affected bookings without altering them", async () => {
    const r = await book("a", at(3, "15:00"));
    await sql()`UPDATE working_hours SET end_time = '14:00' WHERE end_time = '17:00'`;
    expect(await flagScheduleConflicts()).toBe(1);
    const [b] = await sql()`SELECT needs_review, status, starts_at FROM bookings WHERE id = ${r.bookingId}`;
    expect(b.needs_review).toBe(true);
    expect(b.status).toBe("confirmed");
    expect(b.starts_at.toISOString()).toBe(at(3, "15:00").toISOString());
  });

  it("completed and no-show bookings keep redemption history", async () => {
    await sql()`INSERT INTO admin_users (id, email, name, password_hash) VALUES (1, 'a@x.test', 'A', 'x')`;
    await sql()`INSERT INTO promotions (name, code, application, discount_type, percent_off) VALUES ('P', 'P10', 'code', 'percent', 10)`;
    const a = await book("a", at(3, "10:00"), { code: "P10" });
    const b = await book("b", at(3, "14:00"), { code: "P10" });
    await setBookingStatus(a.bookingId, "completed", 1, { sendReviewInvite: true });
    await setBookingStatus(b.bookingId, "no_show", 1);
    const rows = await sql()`SELECT status FROM promotion_redemptions ORDER BY booking_id`;
    expect(rows.map((r) => r.status)).toEqual(["consumed", "forfeited"]);
    const [inv] = await sql()`SELECT kind FROM notification_jobs WHERE kind = 'review_invite'`;
    expect(inv).toBeTruthy();
  });
});

describe("access control", () => {
  it("booking ids alone grant nothing; only a valid token resolves", async () => {
    const r = await book("a", at(3, "10:00"));
    expect(await bookingIdForToken(String(r.bookingId), "manage")).toBeNull();
    expect(await bookingIdForToken("A".repeat(43), "manage")).toBeNull();
    const [b] = await sql()`SELECT starts_at FROM bookings WHERE id = ${r.bookingId}`;
    const token = await mintManageToken(r.bookingId, b.starts_at);
    expect(await bookingIdForToken(token, "manage")).toBe(r.bookingId);
    expect(await bookingIdForToken(token, "review")).toBeNull();
    await sql()`UPDATE booking_access_tokens SET revoked_at = now()`;
    expect(await bookingIdForToken(token, "manage")).toBeNull();
  });

  it("the address is only included for confirmed bookings", async () => {
    const r = await book("a", at(3, "10:00"));
    expect((await customerBookingView(r.bookingId))!.address?.lines).toBe("1 Secret Lane");
    await cancelBooking(r.bookingId, { type: "customer", id: null });
    expect((await customerBookingView(r.bookingId))!.address).toBeNull();
  });
});
