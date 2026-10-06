import { Star } from "@phosphor-icons/react/dist/ssr";
import { MediaImage } from "@/components/media-image";
import type { PublicTestimonial } from "@/lib/server/public-content";

export function ExampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block border border-current px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] ${className}`}>
      Example
    </span>
  );
}

export function TestimonialFigure({ t, size }: { t: PublicTestimonial; size: "lead" | "small" | "card" }) {
  const lead = size === "lead";
  return (
    <figure className={lead ? "grid gap-8 sm:grid-cols-[minmax(0,180px)_1fr] sm:items-start" : "grid grid-cols-[72px_1fr] gap-5"}>
      {t.media ? (
        <div className={`relative overflow-hidden bg-night-2 ${lead ? "aspect-[4/5] w-full max-w-[180px]" : "aspect-square w-[72px]"}`}>
          <MediaImage media={t.media} sizes={lead ? "180px" : "72px"} />
        </div>
      ) : (
        <div aria-hidden className={lead ? "hidden sm:block" : "leopard-dark aspect-square w-[72px]"} />
      )}
      <div>
        {t.rating && (
          <p className="flex gap-0.5 text-champagne" aria-label={`${t.rating} out of 5`}>
            {Array.from({ length: t.rating }, (_, i) => (
              <Star key={i} size={lead ? 16 : 13} weight="fill" aria-hidden />
            ))}
          </p>
        )}
        <blockquote className={lead ? "display mt-4 text-3xl leading-[1.18] md:text-[2.4rem]" : "mt-2 leading-relaxed"}>
          <p>“{t.quote}”</p>
        </blockquote>
        <figcaption className={`mt-4 flex items-center gap-3 text-sm ${lead ? "" : "text-[0.82rem]"} text-nude`}>
          <span>{t.name}</span>
          {t.isExample && <ExampleTag />}
        </figcaption>
      </div>
    </figure>
  );
}
