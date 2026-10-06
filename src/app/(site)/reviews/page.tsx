import type { Metadata } from "next";
import Link from "next/link";
import { testimonials } from "@/lib/server/public-content";
import { MediaImage } from "@/components/media-image";
import { ExampleTag } from "@/components/testimonial";
import { Star } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const items = await testimonials();
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 md:px-8 md:pt-20">
      <h1 className="display text-5xl md:text-7xl">Reviews</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-taupe">
        Reviews come from clients after their appointment and are checked before they appear here.
      </p>
      {items.some((t) => t.isExample) && (
        <p className="mt-3 max-w-2xl text-sm text-taupe">Reviews marked “Example” are layout placeholders, not real client reviews.</p>
      )}
      {items.length === 0 ? (
        <p className="mt-12 text-taupe">No reviews yet.</p>
      ) : (
        <ul className="mt-14 grid gap-x-12 gap-y-16 md:grid-cols-2">
          {items.map((t, i) => (
            <li key={t.id} className={`grid gap-6 ${t.media ? "sm:grid-cols-[160px_1fr]" : ""} ${i % 3 === 0 ? "md:col-span-2 md:max-w-4xl" : ""}`} data-reveal>
              {t.media && (
                <div className="relative aspect-[4/5] w-full max-w-[160px] overflow-hidden bg-cream">
                  <MediaImage media={t.media} sizes="160px" />
                </div>
              )}
              <figure>
                {t.rating && (
                  <p className="flex gap-0.5 text-champagne-text" aria-label={`${t.rating} out of 5`}>
                    {Array.from({ length: t.rating }, (_, n) => <Star key={n} size={15} weight="fill" aria-hidden />)}
                  </p>
                )}
                <blockquote className={`mt-3 ${i % 3 === 0 ? "display text-3xl leading-[1.2] md:text-4xl" : "text-lg leading-relaxed"}`}>
                  <p>“{t.quote}”</p>
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3 text-sm text-taupe">
                  <span>{t.name}</span>
                  {t.isExample && <ExampleTag />}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-20 border-t border-line pt-10">
        <p className="text-taupe">Been to see me? You&apos;ll get a link to leave a review by email after your appointment.</p>
        <Link href="/book" className="btn btn-primary mt-6">Book an appointment</Link>
      </div>
    </div>
  );
}
