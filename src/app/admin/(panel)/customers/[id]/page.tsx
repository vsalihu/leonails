import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { PageHeader, Panel, StatusBadge } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { formatPence } from "@/lib/money";
import { blockAction, contactAction, notesAction } from "../actions";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = sql();
  const s = await getSettings();
  const [c] = await db`SELECT * FROM customers WHERE id = ${id}`;
  if (!c) notFound();
  const [bookings, related, redemptions] = await Promise.all([
    db`SELECT b.id, b.status, b.starts_at, b.total_pence, b.payment_received_pence, (SELECT string_agg(name, ' + ' ORDER BY sort_order) FROM booking_items WHERE booking_id = b.id) AS items FROM bookings b WHERE customer_id = ${id} ORDER BY starts_at DESC`,
    c.phone_normalised ? db`SELECT id, name, email FROM customers WHERE phone_normalised = ${c.phone_normalised} AND id <> ${id}` : Promise.resolve([]),
    db`SELECT p.name, r.status, r.saving_pence FROM promotion_redemptions r JOIN promotions p ON p.id = r.promotion_id WHERE r.customer_id = ${id} ORDER BY r.id DESC`,
  ]);
  const z = (d: Date) => DateTime.fromJSDate(d, { zone: s.timezone }).toFormat("ccc d LLL yyyy, HH:mm");
  return (
    <>
      <PageHeader title={c.name} back={{ href: "/admin/customers", label: "Customers" }}>
        <Link href="/admin/bookings/new" className="btn btn-outline min-h-11">New booking</Link>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title={`Appointments (${bookings.length})`}>
            {bookings.length === 0 ? <p className="text-sm text-taupe">No appointments.</p> : (
              <ul className="divide-y divide-line">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 text-sm hover:bg-cream/40">
                      <span className="tabular-nums">{z(b.starts_at)}</span>
                      <StatusBadge status={b.status} />
                      <span className="text-taupe">{b.items}</span>
                      <span className="text-right tabular-nums">{formatPence(b.total_pence)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Private notes">
            <p className="mb-3 text-xs text-taupe">Only visible to admins. Never shown to the customer.</p>
            <ActionForm action={notesAction} submitLabel="Save notes">
              <input type="hidden" name="id" value={id} />
              <label htmlFor="notes" className="sr-only">Private notes</label>
              <textarea id="notes" name="notes" rows={5} defaultValue={c.private_notes ?? ""} className="input" placeholder="Allergies, preferences, nail health..." />
            </ActionForm>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Contact">
            <p className="text-sm"><a className="underline break-all" href={`mailto:${c.email}`}>{c.email}</a></p>
            <p className="mt-1 text-xs text-taupe">{c.email_verified_at ? `Email verified ${z(c.email_verified_at)}` : "Email not verified (admin-created)"}</p>
            <ActionForm action={contactAction} className="mt-4 grid gap-4">
              <input type="hidden" name="id" value={id} />
              <AField name="name" label="Name"><input name="name" defaultValue={c.name} className="input" /></AField>
              <AField name="phone" label="Phone"><input name="phone" defaultValue={c.phone ?? ""} className="input" /></AField>
            </ActionForm>
            {related.length > 0 && (
              <div className="mt-4 border-t border-line pt-4 text-sm">
                <p className="text-champagne-text">Same phone number as:</p>
                <ul className="mt-1">{related.map((r) => <li key={r.id}><Link className="underline" href={`/admin/customers/${r.id}`}>{r.name} ({r.email})</Link></li>)}</ul>
                <p className="mt-2 text-xs text-taupe">Records are never merged automatically.</p>
              </div>
            )}
          </Panel>
          {redemptions.length > 0 && (
            <Panel title="Offers used">
              <ul className="space-y-1 text-sm">{redemptions.map((r, i) => <li key={i} className="flex justify-between"><span>{r.name}</span><span className="text-taupe">{r.status}, {formatPence(r.saving_pence)}</span></li>)}</ul>
            </Panel>
          )}
          <Panel title="Online booking">
            {c.is_blocked ? (
              <>
                <p className="text-sm text-error">Blocked {c.blocked_at ? `on ${z(c.blocked_at)}` : ""}: {c.blocked_reason}</p>
                <ActionForm action={blockAction} submitLabel="Unblock" submitClassName="btn btn-outline min-h-10 px-4">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="block" value="0" />
                </ActionForm>
              </>
            ) : (
              <ActionForm action={blockAction} submitLabel="Block online booking" submitClassName="btn btn-outline min-h-10 px-4" confirm="Block this customer from booking online?" className="grid gap-3">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="block" value="1" />
                <AField name="reason" label="Reason" help="Recorded in the audit log."><input name="reason" className="input" /></AField>
              </ActionForm>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
