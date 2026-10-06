import "server-only";
import { DateTime } from "luxon";
import { sql, type Db } from "./db";
import { computeSlots, type Busy, type ScheduleException, type Slot, type WeeklyHours } from "../availability";
import type { Settings } from "./settings";

export async function defaultTechnicianId(db: Db = sql()): Promise<number> {
  const [r] = await db`SELECT id FROM technicians WHERE is_default AND is_active LIMIT 1`;
  if (!r) throw new Error("No active default technician configured.");
  return r.id;
}

function hhmm(t: string): string {
  return t.slice(0, 5);
}

export async function loadRules(technicianId: number, fromDate: string, toDate: string, db: Db = sql()) {
  const weekly: WeeklyHours[] = (
    await db`SELECT weekday, start_time::text AS s, end_time::text AS e FROM working_hours WHERE technician_id = ${technicianId}`
  ).map((r) => ({ weekday: r.weekday, start: hhmm(r.s), end: hhmm(r.e) }));
  const exceptions: ScheduleException[] = (
    await db`
      SELECT local_date::text AS d, kind, start_time::text AS s, end_time::text AS e
      FROM schedule_exceptions
      WHERE technician_id = ${technicianId} AND local_date BETWEEN ${fromDate} AND ${toDate}`
  ).map((r) => ({ localDate: r.d, kind: r.kind, start: r.s ? hhmm(r.s) : null, end: r.e ? hhmm(r.e) : null }));
  return { weekly, exceptions };
}

/**
 * Occupied intervals. Expired holds are ignored here even if cleanup has not
 * removed them yet. `excludeBookingId` lets a booking be rescheduled within
 * its own current interval.
 */
export async function loadBusy(
  technicianId: number,
  from: Date,
  to: Date,
  opts: { excludeBookingId?: number; excludeHoldId?: number; excludeSessionId?: string } = {},
  db: Db = sql(),
): Promise<Busy[]> {
  const rows = await db`
    SELECT lower(period) AS s, upper(period) AS e FROM calendar_blocks
    WHERE technician_id = ${technicianId}
      AND period && tstzrange(${from}, ${to})
      AND (kind = 'booking' OR expires_at > now())
      ${opts.excludeBookingId ? db`AND booking_id IS DISTINCT FROM ${opts.excludeBookingId}` : db``}
      ${opts.excludeHoldId ? db`AND hold_id IS DISTINCT FROM ${opts.excludeHoldId}` : db``}
      ${opts.excludeSessionId ? db`AND NOT (kind = 'hold' AND hold_id IN (SELECT id FROM slot_holds WHERE session_id = ${opts.excludeSessionId}))` : db``}`;
  return rows.map((r) => ({ start: r.s, end: r.e }));
}

function dayBounds(date: string, tz: string) {
  const d = DateTime.fromISO(date, { zone: tz });
  // pad by a day either side so long services/buffers crossing midnight are seen
  return { from: d.minus({ days: 1 }).toJSDate(), to: d.plus({ days: 2 }).toJSDate() };
}

export async function slotsForDate(
  settings: Settings,
  date: string,
  durationMinutes: number,
  opts: { technicianId?: number; excludeBookingId?: number; excludeSessionId?: string; now?: Date; ignoreNotice?: boolean } = {},
  db: Db = sql(),
): Promise<Slot[]> {
  const technicianId = opts.technicianId ?? (await defaultTechnicianId(db));
  const { weekly, exceptions } = await loadRules(technicianId, date, date, db);
  const { from, to } = dayBounds(date, settings.timezone);
  const busy = await loadBusy(technicianId, from, to, { excludeBookingId: opts.excludeBookingId, excludeSessionId: opts.excludeSessionId }, db);
  return computeSlots({
    date, weekly, exceptions, busy, durationMinutes, now: opts.now ?? new Date(),
    rules: {
      tz: settings.timezone,
      gridMinutes: settings.slotIntervalMinutes,
      bufferMinutes: settings.bufferMinutes,
      minNoticeMinutes: opts.ignoreNotice ? 0 : settings.minNoticeMinutes,
      horizonDays: opts.ignoreNotice ? 3650 : settings.horizonDays,
    },
  });
}

/** Per-day availability summary across the booking horizon (for the date picker). */
export async function availableDays(
  settings: Settings,
  durationMinutes: number,
  opts: { technicianId?: number; excludeBookingId?: number; excludeSessionId?: string; now?: Date } = {},
  db: Db = sql(),
): Promise<{ date: string; slots: number }[]> {
  const technicianId = opts.technicianId ?? (await defaultTechnicianId(db));
  const now = opts.now ?? new Date();
  const today = DateTime.fromJSDate(now, { zone: settings.timezone }).startOf("day");
  const last = today.plus({ days: settings.horizonDays });
  const { weekly, exceptions } = await loadRules(technicianId, today.toISODate()!, last.toISODate()!, db);
  const busy = await loadBusy(technicianId, today.minus({ days: 1 }).toJSDate(), last.plus({ days: 2 }).toJSDate(), { excludeBookingId: opts.excludeBookingId, excludeSessionId: opts.excludeSessionId }, db);
  const out: { date: string; slots: number }[] = [];
  for (let d = today; d <= last; d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    const slots = computeSlots({
      date, weekly, exceptions, busy, durationMinutes, now,
      rules: { tz: settings.timezone, gridMinutes: settings.slotIntervalMinutes, bufferMinutes: settings.bufferMinutes, minNoticeMinutes: settings.minNoticeMinutes, horizonDays: settings.horizonDays },
    });
    out.push({ date, slots: slots.length });
  }
  return out;
}
