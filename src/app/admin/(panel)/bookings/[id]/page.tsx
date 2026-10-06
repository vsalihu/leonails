import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { PageHeader, Panel, StatusBadge } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { formatDuration, formatPence } from "@/lib/money";
import { nowMs } from "@/lib/server/clock";
import { cancelAction, paymentAction, rescheduleAction, resendConfirmationAction, revokeLinksAction, statusAction } from "../actions";
import { retryJobAction } from "../../messages/actions";

export const metadata: Metadata = { title: "Booking" };

const METHOD: Record<string, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", other: "Other" };

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id: idParam }, sp] = await Promise.all([params, searchParams]);
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();
  const db = sql();
  const s = await getSettings();
  const [b] = await db`SELECT * FROM bookings WHERE id = ${id}`;
  if (!b) notFound();
  const [items, jobs, history, [customer]] = await Promise.all([
    db`SELECT * FROM booking_items WHERE booking_id = ${id} ORDER BY sort_order, id`,
    db`SELECT id, kind, status, attempts, last_error, run_at, sent_at, recipient FROM notification_jobs WHERE booking_id = ${id} ORDER BY id`,
    db`SELECT e.*, a.name AS admin_name FROM audit_events e LEFT JOIN admin_users a ON a.id = e.actor_id AND e.actor_type = 'admin' WHERE entity_type = 'booking' AND entity_id = ${id} ORDER BY e.created_at`,
    db`SELECT id, is_blocked, blocked_reason, private_notes FROM customers WHERE id = ${b.customer_id}`,
  ]);
  const z = (d: Date, f = "ccc d LLL yyyy, HH:mm") => DateTime.fromJSDate(d, { zone: s.timezone }).toFormat(f);
  const start = DateTime.fromJSDate(b.starts_at, { zone: s.timezone });
  const insideCutoff = b.starts_at.getTime() - nowMs() < s.customerChangeCutoffMinutes * 60_000;
  const isPast = b.ends_at.getTime() < nowMs();

  return (
    <>
      <PageHeader title={b.customer_name} back={{ href: "/admin/bookings", label: "Bookings" }}>
        <StatusBadge status={b.status} />
      </PageHeader>
      {sp.created && <p className="mb-6 border-l-2 border-success bg-paper px-4 py-3 text-sm" role="status">Booking created.</p>}
      {b.status === "cancelled" && (
        <p className="mb-6 border-l-2 border-taupe bg-paper px-4 py-3 text-sm" role="status">
          Cancelled{b.cancelled_at ? ` on ${z(b.cancelled_at)}` : ""}{b.cancellation_reason ? `. Reason: ${b.cancellation_reason}` : ""}. The time is free for other bookings.
        </p>
      )}
      {b.needs_review && b.status === "confirmed" && (
        <p className="mb-6 border-l-2 border-error bg-paper px-4 py-3 text-sm" role="alert"><strong className="font-medium">Check this booking:</strong> {b.review_reason}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Appointment">
            <p className="text-2xl tabular-nums">{z(b.starts_at, "cccc d LLLL yyyy")}</p>
            <p className="text-lg tabular-nums">{z(b.starts_at, "HH:mm")} to {z(b.ends_at, "HH:mm")} <span className="text-taupe">(+{b.buffer_minutes} min buffer)</span></p>
            <table className="mt-5 w-full text-sm">
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}><td className="py-2">{i.name}</td><td className="py-2 text-taupe">{formatDuration(i.duration_minutes)}</td><td className="py-2 text-right tabular-nums">{formatPence(i.price_pence)}</td></tr>
                ))}
                {b.discount_pence > 0 && (
                  <tr><td className="py-2 text-success" colSpan={2}>{b.promotion_snapshot?.name ?? "Manual discount"}{b.manual_discount_reason ? ` (${b.manual_discount_reason})` : ""}</td><td className="py-2 text-right tabular-nums text-success">-{formatPence(b.discount_pence)}</td></tr>
                )}
                <tr className="font-medium"><td className="py-2" colSpan={2}>Expected at appointment</td><td className="py-2 text-right tabular-nums">{formatPence(b.total_pence)}</td></tr>
                <tr><td className="py-2" colSpan={2}>Payment recorded</td><td className="py-2 text-right tabular-nums">{b.payment_received_pence !== null ? `${formatPence(b.payment_received_pence)} (${METHOD[b.payment_method] ?? b.payment_method})` : "None yet"}</td></tr>
              </tbody>
            </table>
            {b.customer_notes && <p className="mt-4 border-l-2 border-line pl-3 text-sm"><span className="text-taupe">Customer note:</span> {b.customer_notes}</p>}
            <p className="mt-4 text-xs text-taupe">Reference {b.reference}. Booked {b.source === "admin" ? "by admin" : "online"} on {z(b.created_at)}. Policy versions {Object.entries(b.policy_versions ?? {}).map(([k, v]) => `${k} v${v}`).join(", ") || "none"}.</p>
          </Panel>

          {b.status !== "cancelled" && (
            <Panel title="Record payment">
              <ActionForm action={paymentAction} submitLabel="Record payment" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <AField name="amount" label="Amount received (£)"><input name="amount" inputMode="decimal" defaultValue={((b.payment_received_pence ?? b.total_pence) / 100).toFixed(2)} className="input" /></AField>
                <AField name="method" label="Method">
                  <select name="method" defaultValue={b.payment_method ?? "cash"} className="input">
                    {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </AField>
              </ActionForm>
            </Panel>
          )}

          {b.status !== "cancelled" && (
            <Panel title={b.status === "confirmed" ? "After the appointment" : "Correct status"}>
              <ActionForm action={statusAction} submitLabel="Update status" className="grid gap-4">
                <input type="hidden" name="id" value={id} />
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="sr-only">Status</legend>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="status" value="completed" defaultChecked={b.status !== "no_show"} className="accent-[var(--color-ink)]" /> Completed</label>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="status" value="no_show" defaultChecked={b.status === "no_show"} className="accent-[var(--color-ink)]" /> No-show</label>
                </fieldset>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invite" defaultChecked className="accent-[var(--color-ink)]" /> Email a review invitation (completed only)</label>
                {b.status !== "confirmed" && <AField name="reason" label="Reason for correction"><input name="reason" className="input" required /></AField>}
                {!isPast && b.status === "confirmed" && <p className="text-xs text-taupe">This appointment hasn&apos;t finished yet.</p>}
              </ActionForm>
            </Panel>
          )}

          {b.status === "confirmed" && (
            <Panel title="Move appointment">
              <ActionForm action={rescheduleAction} submitLabel="Move appointment" pendingLabel="Moving" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <AField name="date" label="New date"><input name="date" type="date" defaultValue={start.toISODate()!} className="input" required /></AField>
                <AField name="time" label="New start time" help={`Keeps the booked length (${formatDuration((b.ends_at - b.starts_at) / 60000)}).`}><input name="time" type="time" step={300} defaultValue={start.toFormat("HH:mm")} className="input" required /></AField>
                <AField name="reason" label="Reason (needed inside the cutoff)" className="sm:col-span-2"><input name="reason" className="input" /></AField>
                <div className="grid gap-2 text-sm sm:col-span-2">
                  {insideCutoff && <label className="flex items-center gap-2"><input type="checkbox" name="override" className="accent-[var(--color-ink)]" /> Override the {s.customerChangeCutoffMinutes / 60}-hour cutoff</label>}
                  <label className="flex items-center gap-2"><input type="checkbox" name="outsideHours" className="accent-[var(--color-ink)]" /> Allow outside working hours</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="acceptPrice" className="accent-[var(--color-ink)]" /> Accept a price change if an offer no longer applies</label>
                  <p className="text-xs text-taupe">Overlaps with other appointments are always refused. <Link className="underline" href={`/admin/calendar?date=${start.toISODate()}`}>See the day</Link></p>
                </div>
              </ActionForm>
            </Panel>
          )}

          {b.status === "confirmed" && (
            <Panel title="Cancel appointment">
              <ActionForm action={cancelAction} submitLabel="Cancel appointment" pendingLabel="Cancelling" submitClassName="btn btn-outline border-error text-error hover:!bg-error hover:!text-ivory" confirm="Cancel this appointment? The time will be released." className="grid gap-4">
                <input type="hidden" name="id" value={id} />
                <AField name="reason" label="Reason"><input name="reason" className="input" placeholder="e.g. Client called to cancel" /></AField>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" defaultChecked className="accent-[var(--color-ink)]" /> Email the customer</label>
                {insideCutoff && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="override" className="accent-[var(--color-ink)]" /> Override the cutoff (reason required)</label>}
              </ActionForm>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Customer" actions={<Link href={`/admin/customers/${b.customer_id}`} className="text-sm underline">Profile</Link>}>
            <p className="font-medium">{b.customer_name}</p>
            <p className="mt-1 text-sm"><a className="underline break-all" href={`mailto:${b.customer_email}`}>{b.customer_email}</a></p>
            {b.customer_phone && <p className="mt-1 text-sm"><a className="underline" href={`tel:${String(b.customer_phone).replace(/\s/g, "")}`}>{b.customer_phone}</a></p>}
            {customer?.is_blocked && <p className="mt-3 text-sm text-error">Blocked from online booking: {customer.blocked_reason}</p>}
            {customer?.private_notes && <p className="mt-3 border-l-2 border-line pl-3 text-sm"><span className="text-taupe">Private notes:</span> {customer.private_notes}</p>}
          </Panel>

          <Panel title="Emails">
            {jobs.length === 0 ? (
              <p className="text-sm text-taupe">No emails for this booking.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span>{j.kind.replace(/_/g, " ")}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <p className="text-xs text-taupe">
                      {j.status === "pending" ? `Due ${z(j.run_at)}` : j.sent_at ? z(j.sent_at) : ""} {j.attempts > 0 && `· ${j.attempts} attempt${j.attempts > 1 ? "s" : ""}`}
                    </p>
                    {j.last_error && j.status !== "sent" && j.status !== "captured" && <p className="text-xs text-error">{j.last_error}</p>}
                    {j.status === "failed" && (
                      <ActionForm action={retryJobAction} submitLabel="Retry" pendingLabel="Retrying" submitClassName="btn btn-outline min-h-9 px-3 text-xs">
                        <input type="hidden" name="id" value={j.id} />
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {b.status === "confirmed" && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <ActionForm action={resendConfirmationAction} submitLabel="Re-send confirmation" pendingLabel="Queuing" submitClassName="btn btn-outline min-h-10 px-4 text-xs"><input type="hidden" name="id" value={id} /></ActionForm>
                <ActionForm action={revokeLinksAction} submitLabel="Revoke customer links" pendingLabel="Revoking" submitClassName="btn btn-outline min-h-10 px-4 text-xs" confirm="Revoke all management links for this booking? The customer will need a new email to manage it.">
                  <input type="hidden" name="id" value={id} />
                </ActionForm>
              </div>
            )}
          </Panel>

          <Panel title="History">
            <ol className="space-y-3 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <p><span className="font-medium">{h.action.replace("booking.", "").replace(/_/g, " ")}</span> <span className="text-taupe">by {h.actor_type === "admin" ? (h.admin_name ?? "admin") : h.actor_type}</span></p>
                  <p className="text-xs text-taupe">{z(h.created_at)}{h.reason ? `. Reason: ${h.reason}` : ""}</p>
                  {h.details?.from && h.details?.to && <p className="text-xs text-taupe">Moved from {z(new Date(h.details.from))} to {z(new Date(h.details.to))}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
