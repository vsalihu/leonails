import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { PageHeader, Empty } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const db = sql();
  const like = `%${q.trim()}%`;
  const rows = await db`
    SELECT c.id, c.name, c.email, c.phone, c.is_blocked, c.email_verified_at,
      count(b.id) FILTER (WHERE b.status = 'completed')::int AS completed,
      count(b.id) FILTER (WHERE b.status = 'no_show')::int AS no_shows,
      count(b.id) FILTER (WHERE b.status = 'confirmed' AND b.starts_at > now())::int AS upcoming,
      max(b.starts_at) AS last_visit,
      (SELECT count(*)::int FROM customers c2 WHERE c2.phone_normalised = c.phone_normalised AND c2.id <> c.id AND c.phone_normalised IS NOT NULL) AS phone_matches
    FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
    ${q.trim() ? db`WHERE c.name ILIKE ${like} OR c.email ILIKE ${like} OR c.phone ILIKE ${like}` : db``}
    GROUP BY c.id ORDER BY max(b.starts_at) DESC NULLS LAST, c.created_at DESC LIMIT 200`;
  return (
    <>
      <PageHeader title="Customers" />
      <form role="search" className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">Search customers</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, email or phone" className="input min-h-11 max-w-md" />
        <button className="btn btn-primary min-h-11">Search</button>
      </form>
      {rows.length === 0 ? <Empty>No customers found.</Empty> : (
        <ul className="divide-y divide-line border border-line bg-paper">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/customers/${c.id}`} className="grid gap-1 px-4 py-3 hover:bg-cream/40 md:grid-cols-[1.2fr_1.5fr_1fr_auto] md:items-center">
                <span className="font-medium">{c.name}{c.is_blocked && <span className="ml-2 text-xs text-error">Blocked</span>}{c.phone_matches > 0 && <span className="ml-2 text-xs text-champagne-text">Shares a phone number</span>}</span>
                <span className="break-all text-sm text-taupe">{c.email}</span>
                <span className="text-sm text-taupe">{c.completed} visit{c.completed === 1 ? "" : "s"}{c.no_shows > 0 && `, ${c.no_shows} no-show`}{c.upcoming > 0 && `, ${c.upcoming} upcoming`}</span>
                <span className="text-sm text-taupe">{c.last_visit ? DateTime.fromJSDate(c.last_visit).toFormat("d LLL yyyy") : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
