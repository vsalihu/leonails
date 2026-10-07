import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { MediaImage } from "@/components/media-image";
import { HeroMedia } from "@/components/hero-media";
import { HeroFilm } from "@/components/hero-film";
import { TestimonialFigure } from "@/components/testimonial";
import { getContent, galleryItems, heroVideos, openingHours, publicSettings, siteImages, testimonials } from "@/lib/server/public-content";
import { listTreatments } from "@/lib/server/catalogue";
import { publicPromotion } from "@/lib/server/promotions";
import { formatDuration, formatPence } from "@/lib/money";

export default async function HomePage() {
  const [s, content, images, film, treatments, gallery, reviews, promo, hours] = await Promise.all([
    publicSettings(),
    getContent(["home.hero", "home.intro", "home.visit"]),
    siteImages(["home.hero", "home.intro"]),
    heroVideos(),
    listTreatments(),
    galleryItems({ limit: 4 }), // featured first, then most recent
    testimonials({ featuredOnly: true, limit: 3 }),
    publicPromotion(),
    openingHours(),
  ]);
  const featured = treatments.filter((t) => t.isFeatured).slice(0, 4);
  const hero = content["home.hero"];
  const headline = splitHeadline(hero.title ?? "");
  const [lead, ...others] = reviews;

  return (
    <>
      {film.desktop || film.mobile ? (
        /* Hero film: full-bleed under the transparent header, headline set over the dark field of the frame. */
        <section className={`hero-film on-night relative isolate -mt-16 overflow-hidden bg-night text-ivory md:-mt-[4.75rem] ${film.mobile ? "hero-film--portrait" : ""}`}>
          <div className="hero-film-stage relative lg:h-svh lg:min-h-[680px] lg:max-h-[1160px]">
            <div className="hero-film-media">
              <HeroFilm desktop={film.desktop} mobile={film.mobile} label={`Video: ${(film.desktop ?? film.mobile)!.alt || "a manicure in close-up"}`} />
              <div className="hero-film-shade pointer-events-none absolute inset-0" aria-hidden />
            </div>
            <div className="hero-film-copy">
              <div className="hero-copy w-full px-4 md:px-8 xl:px-12 2xl:px-16">
                <p className="eyebrow flex items-center gap-4 text-champagne-light">
                  <span className="h-px w-10 bg-champagne-light/70" aria-hidden />
                  {s.publicLocation}, by appointment
                </p>
                <h1 className="display mt-6 text-[2.9rem] leading-[1.02] text-ivory xs:text-[3.3rem] md:text-[4.4rem] lg:text-[3.3rem] lg:[&>*]:whitespace-nowrap xl:text-[3.7rem] min-[1400px]:text-[4.2rem] 2xl:text-[5rem]">
                  <span className="block">{headline.roman}</span>
                  {headline.italic && <span className="display-italic block text-champagne-light">{headline.italic}</span>}
                </h1>
                <p className="hero-film-lede mt-7 max-w-[22rem] text-[1.05rem] leading-relaxed text-ivory/80">{hero.body}</p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/book" className="btn btn-light">Book an appointment</Link>
                  <Link href="/treatments" className="btn btn-ghost-light">View treatments</Link>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] hidden lg:block" aria-hidden>
              <div className="flex items-center gap-4 px-8 pb-10 text-[0.68rem] xl:px-12 2xl:px-16 font-medium uppercase tracking-[0.24em] text-ivory/60">
                <span className="hero-scroll-cue relative block h-10 w-px overflow-hidden bg-ivory/20" />
                Scroll
              </div>
            </div>
          </div>
          <div className="leopard-dark h-2" aria-hidden />
        </section>
      ) : (
        /* Hero without film: copy left; photograph bleeds to the right edge, joined by a leopard seam. */
        <section className="relative grid lg:min-h-[calc(100dvh-4.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="hero-copy flex flex-col justify-center px-4 pb-14 pt-12 md:px-8 lg:py-20 lg:pl-[max(2rem,calc((100vw-1440px)/2+2rem))] lg:pr-16">
            <p className="eyebrow text-champagne-text">{s.publicLocation}, by appointment</p>
            <h1 className="display mt-7 text-[3rem] leading-[1.02] xs:text-[3.4rem] md:text-[4.4rem] lg:text-[3.9rem] lg:[&>*]:whitespace-nowrap xl:text-[4.9rem] 2xl:text-[5.6rem]">
              <span className="block">{headline.roman}</span>
              {headline.italic && <span className="display-italic block">{headline.italic}</span>}
            </h1>
            <p className="mt-8 max-w-md text-lg leading-relaxed text-taupe">{hero.body}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary">Book an appointment</Link>
              <Link href="/treatments" className="btn btn-outline">View treatments</Link>
            </div>
          </div>
          <div className="hero-image relative grid grid-cols-[10px_1fr] md:grid-cols-[16px_1fr]">
            <div className="leopard-light" aria-hidden />
            <div className="relative aspect-[4/5] lg:aspect-auto">
              <HeroMedia image={images["home.hero"]} sizes="(min-width: 1024px) 46vw, 100vw" />
            </div>
          </div>
        </section>
      )}

      {/* Introduction: editorial text with an inset image */}
      <section className="border-t hairline bg-paper">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-4 py-24 md:grid-cols-12 md:px-8 md:py-36">
          <div className="md:col-span-6 md:col-start-1">
            <div data-reveal="image">
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <MediaImage media={images["home.intro"]} sizes="(min-width: 768px) 46vw, 100vw" />
              </div>
            </div>
          </div>
          <div className="md:col-span-5 md:col-start-8 md:self-center" data-reveal style={{ ["--reveal-index" as string]: 1 }}>
            <h2 className="display text-4xl md:text-5xl">{content["home.intro"].title}</h2>
            <p className="mt-6 text-lg leading-relaxed text-taupe">{content["home.intro"].body}</p>
            <Link href="/about" className="nav-link mt-6">
              About Rugile
            </Link>
          </div>
        </div>
      </section>

      {/* Treatments: an editorial price list, not cards */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[1440px] px-4 py-24 md:px-8 md:py-36">
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <h2 className="display text-5xl md:text-6xl">The <span className="display-italic">menu</span></h2>
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
        <section className="mx-auto max-w-[1440px] px-4 py-24 md:px-8 md:py-36">
          <div className="flex flex-wrap items-end justify-between gap-6" data-reveal>
            <h2 className="display text-5xl md:text-6xl">Recent <span className="display-italic">work</span></h2>
            <Link href="/gallery" className="group inline-flex items-center gap-2 text-sm font-medium">
              <span className="nav-link">Open the gallery</span>
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
                4: ["col-span-2 aspect-[4/5] md:col-span-5 md:row-span-2 md:aspect-auto", "aspect-square md:col-span-4 md:aspect-[4/3]", "aspect-square md:col-span-3 md:aspect-[3/4]", "col-span-2 aspect-[16/10] md:col-span-7 md:aspect-[2/1]"],
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
          <div className="mx-auto grid max-w-[1440px] gap-14 px-4 py-24 md:px-8 md:py-36 lg:grid-cols-[1.25fr_1fr]">
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
      <section className="mx-auto max-w-[1440px] px-4 py-24 md:px-8 md:py-36">
        <div className="grid gap-14 md:grid-cols-2">
          <div data-reveal>
            <p className="eyebrow text-champagne-text">Visit</p>
            <h2 className="display mt-5 text-5xl md:text-6xl">By appointment in <span className="display-italic">{s.publicLocation}</span></h2>
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

/** "Beautiful nails. Considered detail." -> roman first line, italic last sentence. */
function splitHeadline(title: string): { roman: string; italic: string | null } {
  const parts = title.trim().split(/(?<=[.!?])\s+/);
  if (parts.length < 2) return { roman: title, italic: null };
  return { roman: parts.slice(0, -1).join(" "), italic: parts[parts.length - 1] };
}
