import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { bookingsBetween, dashboardAlerts, dayBounds, exampleContentSummary, freeGaps, recentCancellations } from "@/lib/server/admin-queries";
import { mailMode } from "@/lib/server/notifications/mailer";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/admin/ui";
import { formatPence } from "@/lib/money";
import { nowMs } from "@/lib/server/clock";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const { start, end, tz, date } = await dayBounds();
  const [today, gaps, alerts, cancellations, examples] = await Promise.all([
    bookingsBetween(start.toJSDate(), end.toJSDate()),
    freeGaps(date),
    dashboardAlerts(),
    recentCancellations(),
    exampleContentSummary(),
  ]);
  const now = nowMs();
  const next = today.find((b) => b.status === "confirmed" && b.ends_at.getTime() > now);
  const t = (d: Date) => DateTime.fromJSDate(d, { zone: tz }).toFormat("HH:mm");
  const mode = mailMode();
  const exampleItems = [
    examples.settings && "business name and contact details",
    examples.address && "private appointment address",
    Number(examples.treatments) > 0 && `${examples.treatments} example treatments`,
    Number(examples.hours) > 0 && "example working hours",
    Number(examples.media) > 0 && `${examples.media} placeholder images`,
    Number(examples.testimonials) > 0 && `${examples.testimonials} example reviews`,
    Number(examples.copy) > 0 && "placeholder website copy",
    Number(examples.policies) > 0 && "example policies",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title={start.toFormat("cccc d LLLL")}>
        <Link href="/admin/bookings/new" className="btn btn-primary min-h-11">New booking</Link>
        <Link href={`/admin/calendar?date=${date}#block`} className="btn btn-outline min-h-11">Block time</Link>
      </PageHeader>

      <div className="mb-8 space-y-2" aria-label="Alerts">
        {mode !== "smtp" && (
          <Alert href="/admin/messages">
            {mode === "devmailbox"
              ? "Email delivery isn't connected: messages are captured in the development mailbox and not sent to customers."
              : "Email is set to SMTP but isn't fully configured. Messages will fail until SMTP settings are added."}
          </Alert>
        )}
        {alerts.flagged > 0 && <Alert href="/admin/bookings?flagged=1">{alerts.flagged} upcoming booking{alerts.flagged > 1 ? "s need" : " needs"} checking after a schedule or treatment change.</Alert>}
        {alerts.failed_emails > 0 && <Alert href="/admin/messages?tab=emails">{alerts.failed_emails} email{alerts.failed_emails > 1 ? "s" : ""} failed to send.</Alert>}
        {alerts.unresolved_past > 0 && <Alert href="/admin/bookings?status=confirmed&when=past">{alerts.unresolved_past} past appointment{alerts.unresolved_past > 1 ? "s" : ""} still marked confirmed. Mark them completed or no-show.</Alert>}
        {alerts.pending_reviews > 0 && <Alert href="/admin/reviews">{alerts.pending_reviews} review{alerts.pending_reviews > 1 ? "s" : ""} waiting for approval.</Alert>}
        {alerts.new_enquiries > 0 && <Alert href="/admin/messages">{alerts.new_enquiries} new enquir{alerts.new_enquiries > 1 ? "ies" : "y"}.</Alert>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {next && (
            <Panel title="Next appointment">
              <Link href={`/admin/bookings/${next.id}`} className="block">
                <p className="text-3xl tabular-nums">{t(next.starts_at)}<span className="text-lg text-taupe"> to {t(next.ends_at)}</span></p>
                <p className="mt-2 text-lg">{next.customer_name}</p>
                <p className="text-taupe">{next.items}</p>
                {next.customer_phone && <p className="mt-2 text-sm"><a className="underline" href={`tel:${next.customer_phone.replace(/\s/g, "")}`}>{next.customer_phone}</a></p>}
              </Link>
            </Panel>
          )}

          <Panel title={`Today's appointments (${today.length})`}>
            {today.length === 0 ? (
              <Empty>No appointments today.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {today.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/bookings/${b.id}`} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 py-3 hover:bg-cream/50">
                      <span className="tabular-nums">{t(b.starts_at)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{b.customer_name}</span>
                        <span className="block truncate text-sm text-taupe">{b.items}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <StatusBadge status={b.status} />
                        <span className="text-sm tabular-nums">{formatPence(b.total_pence)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Free time today">
            {gaps.length === 0 ? (
              <Empty>No free time left today.</Empty>
            ) : (
              <ul className="space-y-2">
                {gaps.map((g) => (
                  <li key={g.from} className="flex justify-between tabular-nums">
                    <span>{g.from} to {g.to}</span>
                    <span className="text-taupe">{g.minutes} min</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent cancellations">
            {cancellations.length === 0 ? (
              <Empty>None in the last 7 days.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {cancellations.map((c) => (
                  <li key={c.id} className="py-2">
                    <Link href={`/admin/bookings/${c.id}`} className="hover:underline">
                      <span className="font-medium">{c.customer_name}</span>, {DateTime.fromJSDate(c.starts_at, { zone: tz }).toFormat("ccc d LLL HH:mm")}
                    </Link>
                    {c.cancellation_reason && <p className="text-taupe">{c.cancellation_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {exampleItems.length > 0 && (
            <Panel title="Before launch">
              <p className="text-sm text-taupe">Example content still in use:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {exampleItems.map((i) => <li key={i}>{i}</li>)}
              </ul>
              <Link href="/admin/settings" className="mt-4 inline-block text-sm underline underline-offset-4">Open settings</Link>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Alert({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-start gap-3 border-l-2 border-champagne-text bg-paper px-4 py-3 text-sm hover:bg-cream">
      <span className="font-medium text-champagne-text">Attention</span>
      <span>{children}</span>
    </Link>
  );
}
