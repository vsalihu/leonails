import type { Metadata } from "next";
import Link from "next/link";
import { listTreatments } from "@/lib/server/catalogue";
import { getContent } from "@/lib/server/public-content";
import { formatDuration, formatPence } from "@/lib/money";

export const metadata: Metadata = { title: "Treatments and prices", description: "Gel manicures, builder gel and nail art in Wisbech, with prices and durations." };

export default async function TreatmentsPage() {
  const [treatments, content] = await Promise.all([listTreatments(), getContent(["treatments.intro", "treatments.removal"])]);
  const groups = new Map<string, typeof treatments>();
  for (const t of treatments) {
    const key = t.category?.name ?? "Treatments";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const extras = [...new Map(treatments.flatMap((t) => t.extras).map((e) => [e.id, e])).values()];
  const intro = content["treatments.intro"];
  const removal = content["treatments.removal"];

  return (
    <>
      <section className="mx-auto max-w-[1400px] px-4 pb-12 pt-12 md:px-8 md:pt-20">
        <h1 className="display text-5xl md:text-7xl">{intro.title ?? "Treatments and prices"}</h1>
        {intro.body && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-taupe">{intro.body}</p>}
      </section>

      <div className="mx-auto grid max-w-[1400px] gap-16 px-4 pb-20 md:px-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-16">
          {treatments.length === 0 && <p className="text-taupe">Treatments are being updated. Please check back soon.</p>}
          {[...groups.entries()].map(([name, items]) => (
            <section key={name} aria-labelledby={`cat-${name}`}>
              <h2 id={`cat-${name}`} className="text-sm font-medium text-champagne-text">{name}</h2>
              <ul className="mt-4 border-t border-ink/25">
                {items.map((t) => (
                  <li key={t.id} id={t.slug} className="grid gap-x-8 gap-y-3 border-b border-ink/25 py-8 md:grid-cols-[1fr_auto]" data-reveal>
                    <div>
                      <h3 className="display text-3xl md:text-4xl">{t.name}</h3>
                      <p className="mt-3 max-w-xl leading-relaxed text-taupe">{t.description}</p>
                      {t.notes && <p className="mt-3 max-w-xl text-sm text-champagne-text">{t.notes}</p>}
                      {t.extras.length > 0 && (
                        <p className="mt-3 text-sm text-taupe">Optional extras: {t.extras.map((e) => e.name.toLowerCase()).join(", ")}.</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-6 md:flex-col md:items-end md:justify-start">
                      <p className="text-right">
                        <span className="block text-2xl tabular-nums">{formatPence(t.pricePence)}</span>
                        <span className="text-sm text-taupe">{formatDuration(t.durationMinutes)}</span>
                      </p>
                      <Link href={`/book?treatment=${t.slug}`} className="btn btn-outline" aria-label={`Book ${t.name}`}>
                        Book this
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-10 lg:pt-9">
          {extras.length > 0 && (
            <section aria-labelledby="extras" className="border border-line bg-paper">
              <div className="leopard-light h-2" aria-hidden />
              <div className="p-6">
                <h2 id="extras" className="display text-2xl">Extras</h2>
                <p className="mt-2 text-sm text-taupe">Added to a treatment when you book. The time is added to your appointment.</p>
                <ul className="mt-5 space-y-4">
                  {extras.map((e) => (
                    <li key={e.id}>
                      <p className="flex justify-between gap-4"><span className="font-medium">{e.name}</span><span className="tabular-nums">+{formatPence(e.pricePence)}</span></p>
                      <p className="mt-1 text-sm text-taupe">{e.description}{e.durationMinutes > 0 ? ` Adds ${formatDuration(e.durationMinutes)}.` : ""}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {removal.body && (
            <section aria-labelledby="removal">
              <h2 id="removal" className="display text-2xl">{removal.title ?? "Removal"}</h2>
              <p className="mt-3 leading-relaxed text-taupe">{removal.body}</p>
            </section>
          )}
          <section>
            <h2 className="display text-2xl">Paying</h2>
            <p className="mt-3 leading-relaxed text-taupe">The price you see when you book is the price you pay, at your appointment. No deposit is taken.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
