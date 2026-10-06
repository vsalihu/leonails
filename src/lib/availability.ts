/**
 * Pure availability computation. No database access: callers pass in the
 * schedule rules and busy intervals so this can be unit-tested exhaustively.
 *
 * Model
 * - Working hours and exceptions are local wall-clock rules evaluated in `tz`.
 * - Candidate start times step through *absolute* time from each opening
 *   instant on the configured grid. Stepping absolute time means a
 *   daylight-saving gap is skipped naturally and a repeated hour yields
 *   distinct instants (labelled with their offset) rather than duplicates.
 * - The service [start, start + duration) must fit inside one working interval.
 * - The occupied interval [start, start + duration + buffer) must not overlap
 *   any busy interval (bookings, live holds). Busy intervals already include
 *   their own buffer.
 */
import { DateTime, Interval } from "luxon";

export type WeeklyHours = { weekday: number; start: string; end: string }; // "09:30" / "09:30:00"
export type ScheduleException = {
  localDate: string; // YYYY-MM-DD
  kind: "closed" | "custom_hours" | "blocked";
  start?: string | null;
  end?: string | null;
};
export type Busy = { start: Date; end: Date };

export type SlotRules = {
  tz: string;
  gridMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
};

export type Slot = { startsAt: string; endsAt: string; label: string };

function localDateTime(date: string, time: string, tz: string): DateTime {
  const [h, m] = time.split(":").map(Number);
  const d = DateTime.fromISO(date, { zone: tz }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return d;
}

/** Working intervals (absolute) for a local date after applying exceptions. */
export function workingIntervals(
  date: string,
  weekly: WeeklyHours[],
  exceptions: ScheduleException[],
  tz: string,
): Interval[] {
  const day = DateTime.fromISO(date, { zone: tz });
  if (!day.isValid) return [];
  const todays = exceptions.filter((e) => e.localDate === date);
  if (todays.some((e) => e.kind === "closed")) return [];

  const custom = todays.filter((e) => e.kind === "custom_hours");
  const source = custom.length
    ? custom.map((e) => ({ start: e.start!, end: e.end! }))
    : weekly.filter((w) => w.weekday === day.weekday).map((w) => ({ start: w.start, end: w.end }));

  let intervals = source
    .map((s) => Interval.fromDateTimes(localDateTime(date, s.start, tz), localDateTime(date, s.end, tz)))
    .filter((i) => i.isValid && !i.isEmpty());

  // Merge overlapping/adjacent rule rows, then subtract blocked periods.
  intervals = Interval.merge(intervals);
  const blocked = todays
    .filter((e) => e.kind === "blocked")
    .map((e) => Interval.fromDateTimes(localDateTime(date, e.start!, tz), localDateTime(date, e.end!, tz)))
    .filter((i) => i.isValid);
  if (blocked.length) {
    intervals = intervals.flatMap((i) => i.difference(...blocked));
  }
  return intervals.sort((a, b) => a.start!.toMillis() - b.start!.toMillis());
}

export function computeSlots(params: {
  date: string;
  weekly: WeeklyHours[];
  exceptions: ScheduleException[];
  busy: Busy[];
  durationMinutes: number;
  rules: SlotRules;
  now: Date;
}): Slot[] {
  const { date, weekly, exceptions, busy, durationMinutes, rules, now } = params;
  const { tz } = rules;
  const nowDt = DateTime.fromJSDate(now, { zone: tz });
  const earliest = nowDt.plus({ minutes: rules.minNoticeMinutes });
  const lastDate = nowDt.startOf("day").plus({ days: rules.horizonDays });
  const day = DateTime.fromISO(date, { zone: tz });
  if (!day.isValid || day > lastDate || day.endOf("day") < nowDt) return [];

  const busyMs = busy.map((b) => [b.start.getTime(), b.end.getTime()] as const);
  const durationMs = durationMinutes * 60_000;
  const occupiedMs = (durationMinutes + rules.bufferMinutes) * 60_000;
  const stepMs = rules.gridMinutes * 60_000;

  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (const iv of workingIntervals(date, weekly, exceptions, tz)) {
    const open = iv.start!.toMillis();
    const close = iv.end!.toMillis();
    for (let s = open; s + durationMs <= close; s += stepMs) {
      if (s < earliest.toMillis() || seen.has(s)) continue;
      const occEnd = s + occupiedMs;
      if (busyMs.some(([bs, be]) => s < be && bs < occEnd)) continue;
      seen.add(s);
      slots.push({
        startsAt: new Date(s).toISOString(),
        endsAt: new Date(s + durationMs).toISOString(),
        label: DateTime.fromMillis(s, { zone: tz }).toFormat("HH:mm"),
      });
    }
  }

  // Disambiguate wall-clock labels repeated by a daylight-saving fall-back.
  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.label, (counts.get(s.label) ?? 0) + 1);
  for (const s of slots) {
    if ((counts.get(s.label) ?? 0) > 1) {
      s.label = `${s.label} ${DateTime.fromISO(s.startsAt, { zone: tz }).toFormat("ZZZZ")}`;
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** True when [start, end) for a service lies fully inside working time for that local day. */
export function fitsWorkingTime(
  start: Date,
  end: Date,
  weekly: WeeklyHours[],
  exceptions: ScheduleException[],
  tz: string,
): boolean {
  const date = DateTime.fromJSDate(start, { zone: tz }).toISODate()!;
  return workingIntervals(date, weekly, exceptions, tz).some(
    (iv) => iv.start!.toMillis() <= start.getTime() && end.getTime() <= iv.end!.toMillis(),
  );
}

export function localDateOf(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? DateTime.fromISO(instant) : DateTime.fromJSDate(instant);
  return d.setZone(tz).toISODate()!;
}
