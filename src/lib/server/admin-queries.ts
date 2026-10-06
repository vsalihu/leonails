import "server-only";
import { DateTime, Interval } from "luxon";
import { sql } from "./db";
import { getSettings } from "./settings";
import { defaultTechnicianId, loadBusy, loadRules } from "./schedule";
import { workingIntervals } from "../availability";

export type BookingRow = {
  id: number;
  reference: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_id: number;
  total_pence: number;
  payment_received_pence: number | null;
  needs_review: boolean;
  review_reason: string | null;
  source: string;
  items: string;
};

export async function bookingsBetween(from: Date, to: Date, opts: { includeCancelled?: boolean } = {}): Promise<BookingRow[]> {
  return sql()<BookingRow[]>`
    SELECT b.id, b.reference, b.status, b.starts_at, b.ends_at, b.customer_name, b.customer_email, b.customer_phone, b.customer_id,
      b.total_pence, b.payment_received_pence, b.needs_review, b.review_reason, b.source,
      (SELECT string_agg(name, ' + ' ORDER BY sort_order) FROM booking_items WHERE booking_id = b.id) AS items
    FROM bookings b
    WHERE b.starts_at < ${to} AND b.ends_at > ${from}
      ${opts.includeCancelled ? sql()`` : sql()`AND b.status <> 'cancelled'`}
    ORDER BY b.starts_at`;
}

export async function dayBounds(date?: string) {
  const s = await getSettings();
  const d = date ? DateTime.fromISO(date, { zone: s.timezone }) : DateTime.now().setZone(s.timezone);
  const start = d.startOf("day");
  return { tz: s.timezone, start, end: start.plus({ days: 1 }), date: start.toISODate()! };
}

/** Free working time (minus bookings, live holds and blocks) for a local day. */
export async function freeGaps(date: string, minMinutes = 30) {
  const s = await getSettings();
  const tech = await defaultTechnicianId();
  const { weekly, exceptions } = await loadRules(tech, date, date);
  const day = DateTime.fromISO(date, { zone: s.timezone });
  const busy = await loadBusy(tech, day.minus({ days: 1 }).toJSDate(), day.plus({ days: 2 }).toJSDate());
  const busyIv = busy.map((b) => Interval.fromDateTimes(DateTime.fromJSDate(b.start), DateTime.fromJSDate(b.end)));
  const now = DateTime.now();
  return workingIntervals(date, weekly, exceptions, s.timezone)
    .flatMap((iv) => iv.difference(...busyIv))
    .flatMap((iv) => (iv.end! <= now ? [] : [iv.start! < now ? Interval.fromDateTimes(now, iv.end!) : iv]))
    .filter((iv) => iv.length("minutes") >= minMinutes)
    .map((iv) => ({
      from: iv.start!.setZone(s.timezone).toFormat("HH:mm"),
      to: iv.end!.setZone(s.timezone).toFormat("HH:mm"),
      minutes: Math.round(iv.length("minutes")),
    }));
}

export async function dashboardAlerts() {
  const [r] = await sql()`
    SELECT
      (SELECT count(*)::int FROM bookings WHERE needs_review AND status = 'confirmed' AND starts_at > now()) AS flagged,
      (SELECT count(*)::int FROM notification_jobs WHERE status = 'failed') AS failed_emails,
      (SELECT count(*)::int FROM testimonials WHERE status = 'pending') AS pending_reviews,
      (SELECT count(*)::int FROM enquiries WHERE status = 'new') AS new_enquiries,
      (SELECT count(*)::int FROM bookings WHERE status = 'confirmed' AND ends_at < now()) AS unresolved_past`;
  return r as { flagged: number; failed_emails: number; pending_reviews: number; new_enquiries: number; unresolved_past: number };
}

/** Example/placeholder content still present: a launch checklist. */
export async function exampleContentSummary() {
  const [r] = await sql()`
    SELECT
      (SELECT is_example FROM business_settings WHERE id = 1) AS settings,
      (SELECT is_example FROM private_location WHERE id = 1) AS address,
      (SELECT count(*)::int FROM treatments WHERE is_example AND status <> 'archived') AS treatments,
      (SELECT count(*)::int FROM extras WHERE is_example AND status <> 'archived') AS extras,
      (SELECT count(*)::int FROM working_hours WHERE is_example) AS hours,
      (SELECT count(*)::int FROM media_assets WHERE is_example) AS media,
      (SELECT count(*)::int FROM testimonials WHERE is_example AND status = 'approved') AS testimonials,
      (SELECT count(*)::int FROM content_blocks WHERE is_example) AS copy,
      (SELECT count(*)::int FROM policies p WHERE is_example AND version = (SELECT max(version) FROM policies q WHERE q.kind = p.kind)) AS policies,
      (SELECT count(*)::int FROM promotions WHERE is_example AND status = 'active') AS promotions`;
  return r as Record<string, number | boolean>;
}

export async function recentCancellations(days = 7) {
  return sql()`
    SELECT b.id, b.reference, b.customer_name, b.starts_at, b.cancelled_at, b.cancellation_reason
    FROM bookings b WHERE b.status = 'cancelled' AND b.cancelled_at > now() - make_interval(days => ${days})
    ORDER BY b.cancelled_at DESC LIMIT 10`;
}
