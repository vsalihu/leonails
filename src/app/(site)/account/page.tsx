import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { accountBookings, currentCustomer, type AccountBooking } from "@/lib/server/customer-auth";
import { listTreatments } from "@/lib/server/catalogue";
import { getSettings } from "@/lib/server/settings";
import { formatPence } from "@/lib/money";
import { nowMs } from "@/lib/server/clock";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const STATUS: Record<string, string> = { completed: "Completed", cancelled: "Cancelled", no_show: "Missed", confirmed: "Confirmed" };

export default async function AccountPage() {
  const me = await currentCustomer();
  if (!me) redirect("/account/sign-in?next=/account");
  const [bookings, treatments, settings] = await Promise.all([accountBookings(me.id), listTreatments(), getSettings()]);
  const now = nowMs();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.startsAt).getTime() > now).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));

  // "Book again": the treatment and extras of a booking, if they can still be booked online.
  const againHref = (b: AccountBooking) => {
    const t = treatments.find((x) => x.id === b.items.find((i) => i.kind === "treatment")?.refId);
    if (!t) return null;
    const extras = b.items.filter((i) => i.kind === "extra" && t.extras.some((e) => e.id === i.refId)).map((i) => i.refId);
    return `/book?treatment=${encodeURIComponent(t.slug)}${extras.length ? `&extras=${extras.join(",")}` : ""}`;
  };
  const usual = bookings.find((b) => b.status !== "cancelled" && againHref(b)) ?? bookings.find((b) => againHref(b)) ?? null;
  const zone = settings.timezone;
  const first = me.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 md:px-8 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow flex items-center gap-4 text-champagne-text">
            <span className="h-px w-10 bg-champagne" aria-hidden />
            Your account
          </p>
          <h1 className="display mt-5 text-5xl md:text-6xl">
            Hello, <span className="display-italic">{first}.</span>
          </h1>
        </div>
        <form action="/api/account/sign-out" method="post">
          <button className="text-sm text-taupe underline underline-offset-4 hover:text-ink">Sign out</button>
        </form>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
        <div className="grid content-start gap-14">
          {usual ? (
            <section aria-labelledby="h-usual" className="on-night relative overflow-hidden bg-night p-7 text-ivory md:p-10">
              <div className="leopard-dark absolute inset-y-0 left-0 w-1.5" aria-hidden />
              <h2 id="h-usual" className="eyebrow text-champagne-light">Your usual</h2>
              <p className="display mt-4 text-4xl md:text-5xl">{usual.items.find((i) => i.kind === "treatment")?.name}</p>
              {usual.items.some((i) => i.kind === "extra") && (
                <p className="mt-3 text-ivory/70">with {usual.items.filter((i) => i.kind === "extra").map((i) => i.name).join(", ")}</p>
              )}
              <Link href={againHref(usual)!} className="btn btn-light mt-8">
                Book this again <ArrowRight size={14} aria-hidden />
              </Link>
            </section>
          ) : (
            <section className="border border-line bg-paper p-7 md:p-10">
              <h2 className="display text-3xl">{bookings.length ? "Ready when you are" : "Your first appointment"}</h2>
              <p className="mt-3 text-taupe">
                {bookings.length ? "Choose a treatment and a time; your details are filled in for you." : "Once you've booked, your usual treatment appears here, ready to book again."}
              </p>
              <Link href="/book" className="btn btn-primary mt-6">Book an appointment</Link>
            </section>
          )}

          <section aria-labelledby="h-upcoming">
            <h2 id="h-upcoming" className="display text-3xl">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-taupe">Nothing booked at the moment.</p>
            ) : (
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {upcoming.map((b) => {
                  const d = DateTime.fromISO(b.startsAt, { zone });
                  return (
                    <li key={b.id} className="grid grid-cols-[4.5rem_1fr] gap-5 py-6 sm:grid-cols-[4.5rem_1fr_auto] sm:items-center">
                      <div className="text-center">
                        <p className="eyebrow text-champagne-text">{d.toFormat("LLL")}</p>
                        <p className="display text-5xl leading-none">{d.toFormat("d")}</p>
                      </div>
                      <div>
                        <p className="font-medium">{d.toFormat("cccc")} at {d.toFormat("HH:mm")}</p>
                        <p className="mt-1 text-taupe">{b.items.map((i) => i.name).join(" + ")}</p>
                        <p className="mt-1 text-sm text-taupe">Ref {b.reference} · {formatPence(b.totalPence)}</p>
                      </div>
                      <form action="/api/account/manage" method="post" className="col-start-2 sm:col-start-auto">
                        <input type="hidden" name="booking" value={b.id} />
                        <button className="btn btn-outline btn-sm">View or change</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="h-past">
              <h2 id="h-past" className="display text-3xl">Past appointments</h2>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {past.map((b) => {
                  const d = DateTime.fromISO(b.startsAt, { zone });
                  const href = againHref(b);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
                      <div>
                        <p>{b.items.map((i) => i.name).join(" + ")}</p>
                        <p className="mt-0.5 text-sm text-taupe">
                          {d.toFormat("d LLL yyyy")} · {STATUS[b.status] ?? b.status}
                        </p>
                      </div>
                      {href && <Link href={href} className="nav-link">Book again</Link>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside aria-labelledby="h-details" className="lg:sticky lg:top-28 lg:self-start">
          <h2 id="h-details" className="display text-3xl">Your details</h2>
          <p className="mt-2 text-sm text-taupe">Used to fill in your bookings. Your date of birth is kept private.</p>
          <div className="mt-6 border border-line bg-paper p-6">
            <ProfileForm initial={{ name: me.name, phone: me.phone ?? "", dateOfBirth: me.dateOfBirth ?? "" }} email={me.email} />
          </div>
        </aside>
      </div>
    </div>
  );
}
