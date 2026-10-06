import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { CheckCircle, DownloadSimple, MapPin } from "@phosphor-icons/react/dist/ssr";
import { bookingIdForToken, customerBookingView } from "@/lib/server/booking-access";
import { getSettings } from "@/lib/server/settings";
import { AppointmentActions } from "@/components/booking/appointment-actions";
import { formatDuration, formatPence } from "@/lib/money";
import { nowMs } from "@/lib/server/clock";

export const metadata: Metadata = { title: "Your appointment", robots: { index: false, follow: false } };

const STATUS_TEXT: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed",
};

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ confirmed?: string; moved?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const id = await bookingIdForToken(token, "manage");
  if (!id) notFound();
  const [b, settings] = await Promise.all([customerBookingView(id), getSettings()]);
  if (!b) notFound();

  const start = DateTime.fromJSDate(b.startsAt, { zone: settings.timezone });
  const end = DateTime.fromJSDate(b.endsAt, { zone: settings.timezone });
  const canChange = b.status === "confirmed" && b.startsAt.getTime() - nowMs() >= settings.customerChangeCutoffMinutes * 60_000;
  const cutoffHours = settings.customerChangeCutoffMinutes / 60;
  const cutoffText = Number.isInteger(cutoffHours) ? `${cutoffHours} hours` : `${settings.customerChangeCutoffMinutes} minutes`;
  const justConfirmed = sp.confirmed === "1" && b.status === "confirmed";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-10 md:px-8 md:pt-16">
      {justConfirmed && (
        <div className="mb-10 flex items-start gap-4 border border-success/30 bg-paper p-5" role="status">
          <CheckCircle size={32} weight="light" className="success-mark shrink-0 text-success" aria-hidden />
          <div>
            <p className="text-lg font-medium">You&apos;re booked in.</p>
            <p className="mt-1 text-taupe">A confirmation with these details is on its way to {b.customerEmail}. Bookmark this page to manage your appointment.</p>
          </div>
        </div>
      )}
      {sp.moved === "1" && b.status === "confirmed" && (
        <p className="mb-10 border border-success/30 bg-paper p-5" role="status">Your appointment has been moved. We&apos;ve emailed you the new details.</p>
      )}

      <p className="eyebrow text-champagne-text">
        <span className="sr-only">Status: </span>
        {STATUS_TEXT[b.status]} <span className="text-taupe">· {b.reference}</span>
      </p>
      <h1 className="display mt-4 text-4xl md:text-5xl">{start.toFormat("cccc d LLLL")}</h1>
      <p className="mt-3 text-xl">
        {start.toFormat("HH:mm")} to {end.toFormat("HH:mm")} <span className="text-taupe">({formatDuration(end.diff(start, "minutes").minutes)})</span>
      </p>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section aria-labelledby="h-treatment">
          <h2 id="h-treatment" className="text-sm font-medium text-taupe">Treatment</h2>
          <ul className="mt-3 space-y-2">
            {b.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-4">
                <span>{i.name}</span>
                <span className="tabular-nums">{formatPence(i.pricePence)}</span>
              </li>
            ))}
            {b.discountPence > 0 && (
              <li className="flex justify-between gap-4 text-success">
                <span>{b.promotionName ?? "Discount"}</span>
                <span className="tabular-nums">-{formatPence(b.discountPence)}</span>
              </li>
            )}
          </ul>
          <p className="mt-4 flex justify-between gap-4 border-t border-line pt-3 font-medium">
            <span>Total</span>
            <span className="tabular-nums">{formatPence(b.totalPence)}</span>
          </p>
          <p className="mt-1 text-right text-sm text-taupe">Pay at your appointment</p>
        </section>

        <section aria-labelledby="h-where">
          <h2 id="h-where" className="text-sm font-medium text-taupe">Where</h2>
          {b.address ? (
            <div className="mt-3 flex gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-champagne-text" aria-hidden />
              <div>
                <p className="whitespace-pre-line">{b.address.lines}</p>
                {b.address.postcode && <p>{b.address.postcode}</p>}
                {b.address.arrival && <p className="mt-3 text-sm text-taupe">{b.address.arrival}</p>}
                <p className="mt-3 text-xs text-taupe">Please keep this address private.</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-taupe">{settings.publicLocation}</p>
          )}
        </section>
      </div>

      {b.status === "confirmed" && (
        <div className="mt-12 border-t border-line pt-10">
          <AppointmentActions token={token} timezone={settings.timezone} canChange={canChange} cutoffText={cutoffText} />
          <a href={`/api/appointment/${token}/calendar`} className="mt-8 inline-flex items-center gap-2 text-sm underline underline-offset-4">
            <DownloadSimple size={16} aria-hidden /> Add to calendar
          </a>
        </div>
      )}
      {b.status === "cancelled" && (
        <div className="mt-12 border-t border-line pt-10">
          <p className="text-taupe">This appointment was cancelled.</p>
          <Link href="/book" className="btn btn-primary mt-5">Book an appointment</Link>
        </div>
      )}

      <p className="mt-16 text-sm text-taupe">
        Questions? <Link href="/contact" className="underline underline-offset-4">Get in touch</Link>. Read the{" "}
        <Link href="/policies/cancellation" className="underline underline-offset-4">cancellation policy</Link>.
      </p>
    </div>
  );
}
