import "server-only";
import { sql, pgCode, PG_EXCLUSION_VIOLATION, type Db } from "./db";
import { getSettings } from "./settings";
import { resolveSelection } from "./catalogue";
import { defaultTechnicianId, loadRules, slotsForDate } from "./schedule";
import { fitsWorkingTime, localDateOf } from "../availability";
import { totalDuration } from "../pricing";
import { hmac, safeEqual } from "./crypto";
import { enqueue } from "./notifications/outbox";
import { normaliseEmail } from "./customers";

export class BookingError extends Error {
  constructor(
    message: string,
    public code:
      | "slot_taken"
      | "hold_expired"
      | "invalid"
      | "rate_limited"
      | "not_verified"
      | "price_changed"
      | "blocked"
      | "closed"
      | "not_found"
      | "cutoff",
    public data?: unknown,
  ) {
    super(message);
  }
}

export const MAX_VERIFICATION_SENDS = 3;
export const MAX_VERIFICATION_ATTEMPTS = 5;

/** Alternatives offered when a chosen slot is no longer free. */
async function alternatives(durationMinutes: number, date: string) {
  const settings = await getSettings();
  const slots = await slotsForDate(settings, date, durationMinutes);
  return slots.slice(0, 6);
}

export type HoldView = {
  publicId: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  treatmentId: number;
  extraIds: number[];
  email: string | null;
  verified: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped database row
function view(r: Record<string, any>): HoldView {
  return {
    publicId: r.public_id,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    treatmentId: r.treatment_id,
    extraIds: (r.extra_ids as number[]).map(Number),
    email: r.email,
    verified: !!r.email_verified_at,
  };
}

/**
 * Reserves an interval for a checkout session. One live hold per session:
 * creating a new one releases the previous. The exclusion constraint on
 * calendar_blocks guarantees that two concurrent holds for overlapping
 * intervals cannot both succeed.
 */
export async function createHold(input: {
  sessionId: string;
  treatmentId: number;
  extraIds: number[];
  startsAt: Date;
  ipHash: string;
}): Promise<HoldView> {
  const settings = await getSettings();
  if (!settings.bookingsEnabled) throw new BookingError("Online booking is paused at the moment.", "closed");
  const lines = await resolveSelection(input.treatmentId, input.extraIds);
  const duration = totalDuration(lines);
  const technicianId = await defaultTechnicianId();
  const start = input.startsAt;
  const end = new Date(start.getTime() + duration * 60_000);
  const date = localDateOf(start, settings.timezone);

  // Must be one of the slots we would offer right now (grid, hours, notice, horizon).
  // The session's own earlier hold is released inside the transaction, so ignore it here.
  const offered = await slotsForDate(settings, date, duration, { technicianId, excludeSessionId: input.sessionId });
  if (!offered.some((s) => s.startsAt === start.toISOString())) {
    throw new BookingError("Sorry, that time is no longer available.", "slot_taken", { alternatives: offered.slice(0, 6) });
  }

  const db = sql();
  try {
    const row = await db.begin(async (tx) => {
      // Hoarding protection: release this session's previous live holds.
      await releaseSessionHolds(tx, input.sessionId);
      // Expired holds stop blocking straight away; remove any in our way.
      await tx`
        DELETE FROM calendar_blocks
        WHERE technician_id = ${technicianId} AND kind = 'hold' AND expires_at <= now()
          AND period && tstzrange(${start}, ${new Date(end.getTime() + settings.bufferMinutes * 60_000)})`;
      const [hold] = await tx`
        INSERT INTO slot_holds (session_id, technician_id, starts_at, ends_at, buffer_minutes, treatment_id, extra_ids, expires_at, ip_hash)
        VALUES (${input.sessionId}, ${technicianId}, ${start}, ${end}, ${settings.bufferMinutes}, ${input.treatmentId},
                ${lines.filter((l) => l.kind === "extra").map((l) => l.id)}, now() + make_interval(mins => ${settings.holdMinutes}), ${input.ipHash})
        RETURNING *`;
      await tx`
        INSERT INTO calendar_blocks (technician_id, period, kind, hold_id, expires_at)
        VALUES (${technicianId}, tstzrange(${start}, ${new Date(end.getTime() + settings.bufferMinutes * 60_000)}), 'hold', ${hold.id}, ${hold.expires_at})`;
      return hold;
    });
    return view(row);
  } catch (err) {
    if (pgCode(err) === PG_EXCLUSION_VIOLATION) {
      throw new BookingError("Someone has just reserved that time. Please pick another.", "slot_taken", {
        alternatives: await alternatives(duration, date),
      });
    }
    throw err;
  }
}

export async function releaseSessionHolds(db: Db, sessionId: string) {
  const released = await db`
    UPDATE slot_holds SET released_at = now()
    WHERE session_id = ${sessionId} AND released_at IS NULL AND converted_booking_id IS NULL
    RETURNING id`;
  if (released.length) {
    await db`DELETE FROM calendar_blocks WHERE hold_id IN ${db(released.map((r) => r.id))}`;
  }
}

export async function getHold(publicId: string, sessionId: string): Promise<HoldView | null> {
  const [r] = await sql()`
    SELECT * FROM slot_holds WHERE public_id = ${publicId} AND session_id = ${sessionId}
      AND released_at IS NULL AND converted_booking_id IS NULL AND expires_at > now()`;
  return r ? view(r) : null;
}

/** Queues a verification code email for the hold's checkout. */
export async function requestVerification(publicId: string, sessionId: string, email: string) {
  const db = sql();
  const normalised = normaliseEmail(email);
  return db.begin(async (tx) => {
    const [h] = await tx`
      SELECT * FROM slot_holds WHERE public_id = ${publicId} AND session_id = ${sessionId}
        AND released_at IS NULL AND converted_booking_id IS NULL FOR UPDATE`;
    if (!h) throw new BookingError("Your reserved time is no longer held. Please choose a time again.", "hold_expired");
    if (h.expires_at.getTime() <= Date.now()) throw new BookingError("Your reserved time has expired. Please choose a time again.", "hold_expired");
    const [{ sends }] = await tx`SELECT count(*)::int AS sends FROM notification_jobs WHERE kind = 'verify_email' AND (payload->>'holdId')::bigint = ${h.id}`;
    if (sends >= MAX_VERIFICATION_SENDS) throw new BookingError("We've sent several codes already. Please check your inbox and spam folder.", "rate_limited");
    if (h.email && h.email !== normalised) {
      // email changed: reset verification
      await tx`UPDATE slot_holds SET email_verified_at = NULL, verification_code_hash = NULL WHERE id = ${h.id}`;
    }
    await tx`UPDATE slot_holds SET email = ${normalised}, verification_sent_at = now(), verification_attempts = 0 WHERE id = ${h.id}`;
    await enqueue(tx, {
      kind: "verify_email",
      dedupeKey: `verify:${h.id}:${sends + 1}`,
      recipient: normalised,
      payload: { holdId: h.id },
    });
    return { expiresAt: h.expires_at.toISOString() };
  });
}

export async function verifyCode(publicId: string, sessionId: string, code: string): Promise<boolean> {
  const db = sql();
  return db.begin(async (tx) => {
    const [h] = await tx`
      SELECT * FROM slot_holds WHERE public_id = ${publicId} AND session_id = ${sessionId}
        AND released_at IS NULL AND converted_booking_id IS NULL FOR UPDATE`;
    if (!h || h.expires_at.getTime() <= Date.now())
      throw new BookingError("Your reserved time has expired. Please choose a time again.", "hold_expired");
    if (h.email_verified_at) return true;
    if (!h.verification_code_hash) throw new BookingError("Please request a code first. If you just did, it may take a moment to arrive.", "not_verified");
    if (h.verification_attempts >= MAX_VERIFICATION_ATTEMPTS)
      throw new BookingError("Too many incorrect attempts. Please request a new code.", "rate_limited");
    const ok = safeEqual(hmac(`verify:${h.id}:${code.trim()}`), h.verification_code_hash);
    if (ok) {
      await tx`UPDATE slot_holds SET email_verified_at = now() WHERE id = ${h.id}`;
    } else {
      await tx`UPDATE slot_holds SET verification_attempts = verification_attempts + 1 WHERE id = ${h.id}`;
    }
    return ok;
  });
}

/** Removes calendar blocks of expired holds. Availability already ignores them; this is housekeeping. */
export async function cleanupExpiredHolds() {
  await sql()`DELETE FROM calendar_blocks WHERE kind = 'hold' AND expires_at < now() - interval '1 minute'`;
}

export async function holdStillFits(holdTechnicianId: number, start: Date, end: Date, tz: string, db: Db) {
  const date = localDateOf(start, tz);
  const { weekly, exceptions } = await loadRules(holdTechnicianId, date, date, db);
  return fitsWorkingTime(start, end, weekly, exceptions, tz);
}
