import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { PageHeader, StatusBadge, Empty } from "@/components/admin/ui";
import { formatPence } from "@/lib/money";

export const metadata: Metadata = { title: "Bookings" };

const PAGE = 50;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const db = sql();
  const q = sp.q?.trim() ?? "";
  const status = ["confirmed", "completed", "cancelled", "no_show"].includes(sp.status ?? "") ? sp.status! : "";
  const when = sp.when === "past" ? "past" : sp.when === "all" ? "all" : "upcoming";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? DateTime.fromISO(sp.from!, { zone: s.timezone }).toJSDate() : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? DateTime.fromISO(sp.to!, { zone: s.timezone }).plus({ days: 1 }).toJSDate() : null;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const rows = await db`
    SELECT b.id, b.reference, b.status, b.starts_at, b.customer_name, b.customer_email, b.total_pence, b.needs_review, b.source,
      (SELECT string_agg(name, ' + ' ORDER BY sort_order) FROM booking_items WHERE booking_id = b.id) AS items
    FROM bookings b
    WHERE true
      ${q ? db`AND (b.customer_name ILIKE ${"%" + q + "%"} OR b.customer_email ILIKE ${"%" + q + "%"} OR b.customer_phone ILIKE ${"%" + q + "%"} OR b.reference ILIKE ${"%" + q + "%"})` : db``}
      ${status ? db`AND b.status = ${status}` : db``}
      ${when === "upcoming" && !from ? db`AND b.starts_at >= date_trunc('day', now())` : db``}
      ${when === "past" && !to ? db`AND b.starts_at < now()` : db``}
      ${from ? db`AND b.starts_at >= ${from}` : db``}
      ${to ? db`AND b.starts_at < ${to}` : db``}
      ${sp.flagged ? db`AND b.needs_review AND b.status = 'confirmed'` : db``}
    ORDER BY ${when === "past" ? db`b.starts_at DESC` : db`b.starts_at ASC`}
    LIMIT ${PAGE + 1} OFFSET ${(page - 1) * PAGE}`;
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Bookings">
        <Link href="/admin/bookings/new" className="btn btn-primary min-h-11">New booking</Link>
      </PageHeader>

      <form className="mb-6 grid gap-3 border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" role="search">
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-taupe">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Name, email, phone or reference" className="input min-h-11" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="status" className="text-xs text-taupe">Status</label>
          <select id="status" name="status" defaultValue={status} className="input min-h-11">
            <option value="">Any</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="when" className="text-xs text-taupe">When</label>
          <select id="when" name="when" defaultValue={when} className="input min-h-11">
            <option value="upcoming">Today onwards</option><option value="past">Past</option><option value="all">All</option>
          </select>
        </div>
        <div className="grid gap-1"><label htmlFor="from" className="text-xs text-taupe">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input min-h-11" /></div>
        <div className="grid gap-1"><label htmlFor="to" className="text-xs text-taupe">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input min-h-11" /></div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary min-h-11" type="submit">Filter</button>
          <Link href="/admin/bookings" className="btn btn-outline min-h-11">Clear</Link>
        </div>
        {sp.flagged && <input type="hidden" name="flagged" value="1" />}
      </form>

      {sp.flagged && <p className="mb-4 text-sm">Showing bookings flagged for review. <Link className="underline" href="/admin/bookings">Show all</Link></p>}

      {list.length === 0 ? (
        <Empty>No bookings match these filters.</Empty>
      ) : (
        <div className="border border-line bg-paper">
          <table className="w-full text-sm">
            <caption className="sr-only">Bookings</caption>
            <thead className="hidden border-b border-line text-left text-xs text-taupe md:table-header-group">
              <tr><th className="px-4 py-2 font-normal">When</th><th className="px-4 py-2 font-normal">Customer</th><th className="px-4 py-2 font-normal">Treatment</th><th className="px-4 py-2 font-normal">Status</th><th className="px-4 py-2 text-right font-normal">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((b) => (
                <tr key={b.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 hover:bg-cream/40 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <Link href={`/admin/bookings/${b.id}`} className="font-medium tabular-nums underline-offset-4 hover:underline">
                      {DateTime.fromJSDate(b.starts_at, { zone: s.timezone }).toFormat("ccc d LLL yyyy, HH:mm")}
                    </Link>
                    {b.needs_review && <span className="ml-2 text-xs font-medium text-error">Check</span>}
                  </td>
                  <td className="col-start-1 md:px-4 md:py-3">{b.customer_name}<span className="block text-xs text-taupe md:hidden">{b.items}</span></td>
                  <td className="hidden text-taupe md:table-cell md:px-4 md:py-3">{b.items}</td>
                  <td className="col-start-2 row-start-1 md:px-4 md:py-3"><StatusBadge status={b.status} /></td>
                  <td className="col-start-2 row-start-2 text-right tabular-nums md:px-4 md:py-3">{formatPence(b.total_pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link className="underline" href={qs({ page: page - 1 })}>Previous</Link> : <span />}
        {more && <Link className="underline" href={qs({ page: page + 1 })}>Next</Link>}
      </nav>
    </>
  );
}
