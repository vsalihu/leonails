import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { MediaImage } from "@/components/media-image";
import { Parallax } from "@/components/parallax";
import { TestimonialFigure } from "@/components/testimonial";
import { getContent, galleryItems, openingHours, publicSettings, siteImages, testimonials } from "@/lib/server/public-content";
import { listTreatments } from "@/lib/server/catalogue";
import { publicPromotion } from "@/lib/server/promotions";
import { formatDuration, formatPence } from "@/lib/money";

export default async function HomePage() {
  const [s, content, images, treatments, gallery, reviews, promo, hours] = await Promise.all([
    publicSettings(),
    getContent(["home.hero", "home.intro", "home.visit"]),
    siteImages(["home.hero", "home.intro"]),
    listTreatments(),
    galleryItems({ limit: 4 }), // featured first, then most recent
    testimonials({ featuredOnly: true, limit: 3 }),
    publicPromotion(),
    openingHours(),
  ]);
  const featured = treatments.filter((t) => t.isFeatured).slice(0, 4);
  const hero = content["home.hero"];
  const [lead, ...others] = reviews;

  return (
    <>
      {/* Hero: asymmetric split, copy left, photograph right with a leopard edge */}
      <section className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-16 pt-10 md:px-8 lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-[1fr_minmax(0,0.92fr)] lg:items-center lg:gap-16 lg:pb-20 lg:pt-12">
        <div className="hero-copy max-w-xl">
          <p className="eyebrow text-champagne-text">{s.publicLocation}</p>
          <h1 className="display mt-5 text-[2.9rem] xs:text-5xl md:text-6xl xl:text-7xl">{hero.title}</h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-taupe">{hero.body}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/book" className="btn btn-primary">Book an appointment</Link>
            <Link href="/treatments" className="btn btn-outline">View treatments</Link>
          </div>
        </div>
        <div className="hero-image relative">
          <div className="relative grid grid-cols-[1fr_14px] gap-0 md:grid-cols-[1fr_22px]">
            <Parallax className="aspect-[4/5] max-h-[78dvh] w-full bg-cream">
              <MediaImage media={images["home.hero"]} sizes="(min-width: 1024px) 45vw, 100vw" priority />
            </Parallax>
            <div className="leopard-light h-full" aria-hidden />
          </div>
        </div>
      </section>

      {/* Introduction: editorial text with an inset image */}
      <section className="border-t hairline bg-paper">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-20 md:grid-cols-12 md:px-8 md:py-28">
          <div className="md:col-span-5 md:col-start-2" data-reveal>
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              <MediaImage media={images["home.intro"]} sizes="(min-width: 768px) 38vw, 100vw" />
            </div>
          </div>
          <div className="md:col-span-5 md:col-start-8 md:self-center" data-reveal style={{ ["--reveal-index" as string]: 1 }}>
            <h2 className="display text-4xl md:text-5xl">{content["home.intro"].title}</h2>
            <p className="mt-6 text-lg leading-relaxed text-taupe">{content["home.intro"].body}</p>
            <Link href="/about" className="link-underline mt-8 inline-block text-sm font-medium">
              About Rugile
            </Link>
          </div>
        </div>
      </section>

      {/* Treatments: an editorial price list, not cards */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <h2 className="display text-4xl md:text-5xl">Treatments</h2>
              <p className="mt-5 max-w-sm leading-relaxed text-taupe">Prices include everything listed. Extras such as French tips or removal are added when you book.</p>
              <Link href="/treatments" className="btn btn-outline mt-8">View treatments</Link>
            </div>
            <ul className="border-t border-ink/25">
              {featured.map((t, i) => (
                <li key={t.id} className="border-b border-ink/25" data-reveal style={{ ["--reveal-index" as string]: i }}>
                  <Link href={`/book?treatment=${t.slug}`} className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-6 md:py-7">
                    <span className="display text-2xl transition-colors group-hover:text-champagne-text md:text-3xl">{t.name}</span>
                    <span className="text-lg tabular-nums">{formatPence(t.pricePence)}</span>
                    <span className="text-sm text-taupe">{t.description}</span>
                    <span className="text-right text-sm text-taupe">{formatDuration(t.durationMinutes)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Gallery preview: asymmetric mosaic */}
      {gallery.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6" data-reveal>
            <h2 className="display text-4xl md:text-5xl">Recent work</h2>
            <Link href="/gallery" className="group inline-flex items-center gap-2 text-sm font-medium">
              <span className="link-underline">Open the gallery</span>
              <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-4">
            {gallery.map((g, i) => {
              // One cell per image: the mosaic is reshaped for 1-4 items, never padded.
              const layouts: Record<number, string[]> = {
                1: ["col-span-2 aspect-[16/9] md:col-span-12 md:aspect-[21/9]"],
                2: ["col-span-2 aspect-[4/5] md:col-span-7 md:aspect-[4/3]", "col-span-2 aspect-[4/5] md:col-span-5 md:aspect-auto"],
                3: ["col-span-2 aspect-[4/5] md:col-span-5 md:row-span-2 md:aspect-auto", "aspect-square md:col-span-7 md:aspect-[16/9]", "aspect-square md:col-span-7 md:aspect-[16/9]"],
                4: ["col-span-2 aspect-[4/5] md:col-span-5 md:row-span-2 md:aspect-auto", "aspect-square md:col-span-4 md:aspect-[4/3]", "aspect-square md:col-span-3 md:aspect-[3/4]", "col-span-2 aspect-[16/9] md:col-span-7 md:aspect-[21/9]"],
              };
              const layout = layouts[gallery.length][i];
              return (
                <Link key={g.id} href="/gallery" className={`group relative block overflow-hidden bg-cream ${layout}`} data-reveal style={{ ["--reveal-index" as string]: i }}>
                  <MediaImage media={g} sizes="(min-width: 768px) 40vw, 50vw" className="transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.035]" />
                  <span className="sr-only">{g.alt}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Testimonials: one night section, a lead quote and two supporting */}
      {lead && (
        <section className="on-night bg-night text-ivory">
          <div className="mx-auto grid max-w-[1400px] gap-14 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1.25fr_1fr]">
            <div data-reveal>
              <TestimonialFigure t={lead} size="lead" />
            </div>
            <div className="space-y-10 lg:border-l lg:border-ivory/15 lg:pl-14">
              {others.map((t, i) => (
                <div key={t.id} data-reveal style={{ ["--reveal-index" as string]: i + 1 }}>
                  <TestimonialFigure t={t} size="small" />
                </div>
              ))}
              <Link href="/reviews" className="link-underline inline-block text-sm text-nude">Read more reviews</Link>
            </div>
          </div>
        </section>
      )}

      {/* Promotion: plaque on a leopard band; text never sits on the pattern */}
      {promo && (
        <section className="leopard-light py-10 md:py-14" aria-labelledby="offer-heading">
          <div className="mx-auto max-w-[1400px] px-4 md:px-8">
            <div className="mx-auto flex max-w-3xl flex-col items-start gap-5 bg-ivory px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10" data-reveal>
              <div>
                <h2 id="offer-heading" className="display text-2xl md:text-3xl">{promo.name}</h2>
                <p className="mt-2 text-taupe">{promo.bannerText}</p>
              </div>
              <Link href="/book" className="btn btn-primary shrink-0">Book an appointment</Link>
            </div>
          </div>
        </section>
      )}

      {/* Visit: hours list and location note */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-14 md:grid-cols-2">
          <div data-reveal>
            <p className="eyebrow text-champagne-text">Visit</p>
            <h2 className="display mt-4 text-4xl md:text-5xl">By appointment in {s.publicLocation}</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-taupe">{content["home.visit"].body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary">Book an appointment</Link>
              <Link href="/contact" className="btn btn-outline">Ask a question</Link>
            </div>
          </div>
          <div data-reveal style={{ ["--reveal-index" as string]: 1 }}>
            <h3 className="text-sm font-medium">Opening hours</h3>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-10 gap-y-3 text-[0.95rem]">
              {hours.map((h) => (
                <div key={h.day} className="contents">
                  <dt className="text-taupe">{h.day}</dt>
                  <dd className="tabular-nums">{h.hours ?? "Closed"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm text-taupe">Hours can change around holidays. Live availability is always shown when you book.</p>
          </div>
        </div>
      </section>
    </>
  );
}
