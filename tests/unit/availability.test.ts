import { describe, expect, it } from "vitest";
import { computeSlots, workingIntervals, type SlotRules } from "@/lib/availability";

const tz = "Europe/London";
const rules: SlotRules = { tz, gridMinutes: 15, bufferMinutes: 15, minNoticeMinutes: 0, horizonDays: 400 };
// Tuesday-Saturday, lunch break 13:00-14:00 on Tuesday.
const weekly = [
  { weekday: 2, start: "09:30", end: "13:00" },
  { weekday: 2, start: "14:00", end: "18:00" },
  { weekday: 6, start: "00:00", end: "04:00" }, // night hours to exercise DST
  { weekday: 7, start: "00:00", end: "04:00" },
];
const longAgo = new Date("2026-09-01T00:00:00Z"); // before every test date, within the 400-day horizon

describe("computeSlots", () => {
  it("offers 15-minute grid starts whose service fits before the break and closing", () => {
    // 2026-11-03 is a Tuesday (GMT, UTC+0)
    const slots = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy: [], durationMinutes: 60, rules, now: longAgo });
    const labels = slots.map((s) => s.label);
    expect(labels[0]).toBe("09:30");
    expect(labels).toContain("12:00"); // 12:00-13:00 fits exactly
    expect(labels).not.toContain("12:15"); // would overlap the break
    expect(labels).toContain("14:00");
    expect(labels.at(-1)).toBe("17:00");
  });

  it("does not round away service time: a 75 min service needs the full window", () => {
    const slots = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy: [], durationMinutes: 75, rules, now: longAgo });
    const labels = slots.map((s) => s.label);
    expect(labels).toContain("11:45");
    expect(labels).not.toContain("12:00");
    expect(labels.at(-1)).toBe("16:45");
  });

  it("blocks overlap with busy intervals including the new appointment's buffer", () => {
    const busy = [{ start: new Date("2026-11-03T11:00:00Z"), end: new Date("2026-11-03T12:15:00Z") }];
    const slots = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy, durationMinutes: 60, rules, now: longAgo });
    const labels = slots.map((s) => s.label);
    // 09:45 + 60 + 15 buffer = 11:00, touching but not overlapping
    expect(labels).toContain("09:45");
    expect(labels).not.toContain("10:00");
    expect(labels).not.toContain("11:00");
    expect(labels).not.toContain("12:00"); // busy (incl. its buffer) runs to 12:15
    expect(labels).not.toContain("12:15"); // 12:15 + 60 would overlap the lunch break
    expect(labels).toContain("14:00");
  });

  it("a slot may start exactly when a busy interval ends", () => {
    const busy = [{ start: new Date("2026-11-03T10:00:00Z"), end: new Date("2026-11-03T11:15:00Z") }];
    const labels = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy, durationMinutes: 60, rules, now: longAgo }).map((s) => s.label);
    expect(labels).toContain("11:15");
    expect(labels).not.toContain("11:00");
  });

  it("an added extra that lengthens the service removes slots that no longer fit", () => {
    const busy = [{ start: new Date("2026-11-03T11:00:00Z"), end: new Date("2026-11-03T12:00:00Z") }];
    const base = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy, durationMinutes: 60, rules, now: longAgo }).map((s) => s.label);
    const withExtra = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy, durationMinutes: 75, rules, now: longAgo }).map((s) => s.label);
    expect(base).toContain("09:45");
    expect(withExtra).not.toContain("09:45");
    expect(withExtra).toContain("09:30");
  });

  it("respects closed days, custom hours and blocked periods", () => {
    expect(computeSlots({ date: "2026-11-03", weekly, exceptions: [{ localDate: "2026-11-03", kind: "closed" }], busy: [], durationMinutes: 60, rules, now: longAgo })).toEqual([]);
    const custom = computeSlots({ date: "2026-11-03", weekly, exceptions: [{ localDate: "2026-11-03", kind: "custom_hours", start: "10:00", end: "12:00" }], busy: [], durationMinutes: 60, rules, now: longAgo });
    expect(custom.map((s) => s.label)).toEqual(["10:00", "10:15", "10:30", "10:45", "11:00"]);
    const blocked = computeSlots({ date: "2026-11-03", weekly, exceptions: [{ localDate: "2026-11-03", kind: "blocked", start: "15:00", end: "16:00" }], busy: [], durationMinutes: 60, rules, now: longAgo }).map((s) => s.label);
    expect(blocked).toContain("14:00");
    expect(blocked).not.toContain("14:15");
    expect(blocked).toContain("16:00");
  });

  it("applies minimum notice and booking horizon", () => {
    const now = new Date("2026-11-03T08:00:00Z");
    const slots = computeSlots({ date: "2026-11-03", weekly, exceptions: [], busy: [], durationMinutes: 60, rules: { ...rules, minNoticeMinutes: 12 * 60, horizonDays: 60 }, now });
    expect(slots).toEqual([]); // nothing 12h ahead today after 20:00... closes 18:00
    const far = computeSlots({ date: "2027-03-02", weekly, exceptions: [], busy: [], durationMinutes: 60, rules: { ...rules, horizonDays: 60 }, now });
    expect(far).toEqual([]);
  });

  it("spring forward: the missing hour produces no slots and durations stay absolute", () => {
    // 2027-03-28 (Sunday): clocks go 01:00 GMT -> 02:00 BST. Window 00:00-04:00 local is only 3h long.
    const slots = computeSlots({ date: "2027-03-28", weekly, exceptions: [], busy: [], durationMinutes: 60, rules: { ...rules, bufferMinutes: 0 }, now: longAgo });
    const labels = slots.map((s) => s.label);
    expect(labels).not.toContain("01:15");
    expect(labels).toContain("00:45");
    expect(labels).toContain("02:00");
    // 00:30 GMT + 60 min = 02:30 BST: still within the 04:00 close
    const s = slots.find((x) => x.label === "00:30")!;
    expect(new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()).toBe(3_600_000);
    expect(labels.at(-1)).toBe("03:00");
  });

  it("fall back: the repeated hour yields distinct instants with disambiguated labels", () => {
    // 2026-10-25 (Sunday): clocks go 02:00 BST -> 01:00 GMT. Window is 5h long.
    const slots = computeSlots({ date: "2026-10-25", weekly, exceptions: [], busy: [], durationMinutes: 60, rules: { ...rules, bufferMinutes: 0 }, now: longAgo });
    const starts = slots.map((s) => s.startsAt);
    expect(new Set(starts).size).toBe(starts.length);
    const oneThirty = slots.filter((s) => s.label.startsWith("01:30"));
    expect(oneThirty).toHaveLength(2);
    expect(oneThirty[0].label).not.toBe(oneThirty[1].label);
    expect(slots).toHaveLength(17); // (5h - 1h) / 15min + 1
  });

  it("working intervals merge adjacent rows", () => {
    const ivs = workingIntervals("2026-11-03", [{ weekday: 2, start: "09:00", end: "12:00" }, { weekday: 2, start: "12:00", end: "15:00" }], [], tz);
    expect(ivs).toHaveLength(1);
  });
});
