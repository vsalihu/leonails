import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { bookingsBetween, freeGaps } from "@/lib/server/admin-queries";
import { defaultTechnicianId, loadRules } from "@/lib/server/schedule";
import { workingIntervals } from "@/lib/availability";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { blockTimeAction, removeExceptionAction } from "./actions";

export const metadata: Metadata = { title: "Calendar" };

const KIND_TEXT: Record<string, string> = { blocked: "Blocked", closed: "Closed all day", custom_hours: "Custom hours" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const tz = s.timezone;
  const view = sp.view === "day" ? "day" : "week";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? DateTime.fromISO(sp.date!, { zone: tz }) : DateTime.now().setZone(tz).startOf("day");
  const start = view === "week" ? anchor.startOf("week") : anchor.startOf("day");
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => start.plus({ days: i }));
  const end = days[days.length - 1].plus({ days: 1 });
  const tech = await defaultTechnicianId();
  const [bookings, rules, exceptions, holds] = await Promise.all([
    bookingsBetween(start.toJSDate(), end.toJSDate()),
    loadRules(tech, start.toISODate()!, end.toISODate()!),
    sql()`SELECT id, local_date::text AS d, kind, start_time::text AS s, end_time::text AS e, note FROM schedule_exceptions WHERE technician_id = ${tech} AND local_date >= ${start.toISODate()} AND local_date < ${end.toISODate()} ORDER BY local_date, start_time`,
    sql()`SELECT lower(period) AS s, upper(period) AS e FROM calendar_blocks WHERE kind = 'hold' AND expires_at > now() AND period && tstzrange(${start.toJSDate()}, ${end.toJSDate()})`,
  ]);
  const gaps = view === "day" ? await freeGaps(anchor.toISODate()!) : [];

  // timeline bounds from working hours (fallback 08:00-20:00)
  const ivs = days.flatMap((d) => workingIntervals(d.toISODate()!, rules.weekly, rules.exceptions, tz));
  const minH = Math.min(8, ...ivs.map((i) => i.start!.setZone(tz).hour));
  const maxH = Math.max(19, ...ivs.map((i) => Math.ceil(i.end!.setZone(tz).hour + i.end!.setZone(tz).minute / 60)));
  const hourPx = 64;
  const top = (d: DateTime) => ((d.hour + d.minute / 60) - minH) * hourPx;
  const nav = (deltaDays: number) => `?view=${view}&date=${anchor.plus({ days: deltaDays }).toISODate()}`;
  const step = view === "week" ? 7 : 1;
  const z = (d: Date) => DateTime.fromJSDate(d, { zone: tz });

  return (
    <>
      <PageHeader title={view === "week" ? `Week of ${start.toFormat("d LLLL")}` : anchor.toFormat("cccc d LLLL")}>
        <Link href="/admin/bookings/new" className="btn btn-primary min-h-11">New booking</Link>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link className="btn btn-outline min-h-11 px-4" href={nav(-step)} aria-label={`Previous ${view}`}>←</Link>
        <Link className="btn btn-outline min-h-11 px-4" href={`?view=${view}`}>Today</Link>
        <Link className="btn btn-outline min-h-11 px-4" href={nav(step)} aria-label={`Next ${view}`}>→</Link>
        <div className="ml-auto flex gap-1" role="group" aria-label="View">
          <Link className={`btn min-h-11 px-4 ${view === "day" ? "btn-primary" : "btn-outline"}`} href={`?view=day&date=${anchor.toISODate()}`} aria-pressed={view === "day"}>Day</Link>
          <Link className={`btn min-h-11 px-4 ${view === "week" ? "btn-primary" : "btn-outline"}`} href={`?view=week&date=${anchor.toISODate()}`} aria-pressed={view === "week"}>Week</Link>
        </div>
      </div>

      {/* Timeline (tablet and up) */}
      <div className="hidden overflow-x-auto border border-line bg-paper md:block">
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-line" />
          {days.map((d) => (
            <Link key={d.toISODate()} href={`?view=day&date=${d.toISODate()}`} className={`border-b border-l border-line px-2 py-2 text-sm hover:bg-cream ${d.hasSame(DateTime.now().setZone(tz), "day") ? "font-semibold" : ""}`}>
              {d.toFormat("ccc d")}
            </Link>
          ))}
          <div className="relative" style={{ height: (maxH - minH) * hourPx }}>
            {Array.from({ length: maxH - minH }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-2 text-xs text-taupe tabular-nums" style={{ top: i * hourPx }}>{String(minH + i).padStart(2, "0")}:00</span>
            ))}
          </div>
          {days.map((d) => {
            const date = d.toISODate()!;
            const open = workingIntervals(date, rules.weekly, rules.exceptions, tz);
            const dayBookings = bookings.filter((b) => z(b.starts_at).toISODate() === date);
            const dayHolds = holds.filter((h) => z(h.s).toISODate() === date);
            return (
              <div key={date} className="relative border-l border-line bg-cream/60" style={{ height: (maxH - minH) * hourPx }}>
                {Array.from({ length: maxH - minH }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * hourPx }} />)}
                {open.map((iv, i) => {
                  const a = iv.start!.setZone(tz), b = iv.end!.setZone(tz);
                  return <div key={i} aria-hidden className="absolute inset-x-0 bg-paper" style={{ top: top(a), height: top(b) - top(a) }} />;
                })}
                {dayHolds.map((h, i) => {
                  const a = z(h.s), b = z(h.e);
                  return <div key={`h${i}`} className="absolute inset-x-1 border border-dashed border-champagne-text px-1 text-[0.7rem] text-champagne-text" style={{ top: top(a), height: Math.max(18, top(b) - top(a)) }}>Checkout in progress</div>;
                })}
                {dayBookings.map((bk) => {
                  const a = z(bk.starts_at), b = z(bk.ends_at);
                  return (
                    <Link key={bk.id} href={`/admin/bookings/${bk.id}`} className={`absolute inset-x-1 overflow-hidden border-l-2 px-1.5 py-1 text-xs leading-tight shadow-sm ${bk.status === "confirmed" ? "border-ink bg-ivory" : bk.status === "completed" ? "border-success bg-ivory" : "border-error bg-ivory"} ${bk.needs_review ? "outline outline-1 outline-error" : ""}`} style={{ top: top(a), height: Math.max(22, top(b) - top(a)) }}>
                      <span className="block font-medium tabular-nums">{a.toFormat("HH:mm")} {bk.customer_name}</span>
                      <span className="block truncate text-taupe">{bk.items}</span>
                      <span className="sr-only">Status: {bk.status}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* List (phones) */}
      <div className="space-y-4 md:hidden">
        {days.map((d) => {
          const date = d.toISODate()!;
          const list = bookings.filter((b) => z(b.starts_at).toISODate() === date);
          const open = workingIntervals(date, rules.weekly, rules.exceptions, tz);
          return (
            <Panel key={date} title={d.toFormat("cccc d LLLL")} actions={<Link href={`?view=day&date=${date}`} className="text-sm underline">Day</Link>}>
              {open.length === 0 && <p className="text-sm text-taupe">Closed</p>}
              {list.length === 0 ? (
                open.length > 0 && <p className="text-sm text-taupe">No appointments</p>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((b) => (
                    <li key={b.id}>
                      <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span><span className="tabular-nums">{z(b.starts_at).toFormat("HH:mm")}</span> <span className="font-medium">{b.customer_name}</span><span className="block text-sm text-taupe">{b.items}</span></span>
                        <StatusBadge status={b.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {view === "day" && (
          <Panel title="Free time">
            {gaps.length === 0 ? <Empty>No free time on this day.</Empty> : (
              <ul className="space-y-2 text-sm">
                {gaps.map((g) => (
                  <li key={g.from} className="flex items-center justify-between gap-3">
                    <span className="tabular-nums">{g.from} to {g.to} <span className="text-taupe">({g.minutes} min)</span></span>
                    <Link className="underline" href={`/admin/bookings/new?date=${anchor.toISODate()}&time=${g.from}`}>Book</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <Panel title="Changes to hours in this period">
          {exceptions.length === 0 ? <Empty>No blocks or changed hours.</Empty> : (
            <ul className="divide-y divide-line text-sm">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {DateTime.fromISO(e.d).toFormat("ccc d LLL")}: {KIND_TEXT[e.kind]}{e.s ? ` ${e.s.slice(0, 5)} to ${e.e.slice(0, 5)}` : ""}
                    {e.note && <span className="block text-taupe">{e.note}</span>}
                  </span>
                  <ActionForm action={removeExceptionAction} submitLabel="Remove" pendingLabel="Removing" submitClassName="btn btn-outline min-h-9 px-3 text-xs" confirm="Remove this change? Normal hours will apply again.">
                    <input type="hidden" name="id" value={e.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div id="block">
          <Panel title="Block time or change a day">
            <ActionForm action={blockTimeAction} submitLabel="Save" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
              <AField name="date" label="Date"><input name="date" type="date" defaultValue={anchor.toISODate()!} className="input" required /></AField>
              <AField name="kind" label="Type">
                <select name="kind" className="input" defaultValue="blocked">
                  <option value="blocked">Block a period</option>
                  <option value="closed">Close the whole day</option>
                  <option value="custom_hours">Set different opening hours</option>
                </select>
              </AField>
              <AField name="start" label="From" help="Not needed when closing the whole day."><input name="start" type="time" step={300} className="input" /></AField>
              <AField name="end" label="To"><input name="end" type="time" step={300} className="input" /></AField>
              <AField name="note" label="Note (private)" className="sm:col-span-2"><input name="note" className="input" placeholder="e.g. Dentist, holiday" /></AField>
              <p className="text-xs text-taupe sm:col-span-2">Existing appointments are never moved or cancelled. Any that fall outside the new hours are flagged for you to check.</p>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
