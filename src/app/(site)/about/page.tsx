import type { Metadata } from "next";
import Link from "next/link";
import { getContent, openingHours, publicSettings, siteImages } from "@/lib/server/public-content";
import { MediaImage } from "@/components/media-image";

export const metadata: Metadata = { title: "About and visiting" };

export default async function AboutPage() {
  const [s, content, images, hours] = await Promise.all([
    publicSettings(),
    getContent(["about.body", "about.studio", "home.visit"]),
    siteImages(["about.portrait", "visit.studio"]),
    openingHours(),
  ]);
  return (
    <>
      <section className="mx-auto grid max-w-[1400px] gap-12 px-4 pb-20 pt-12 md:grid-cols-12 md:px-8 md:pt-20">
        <div className="md:col-span-6">
          <h1 className="display text-5xl md:text-7xl">{content["about.body"].title ?? "About"}</h1>
          <div className="mt-8 max-w-xl space-y-5 text-lg leading-relaxed text-taupe">
            {content["about.body"].body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
        <div className="md:col-span-5 md:col-start-8">
          <div className="relative aspect-[4/5] overflow-hidden bg-cream" data-reveal>
            <MediaImage media={images["about.portrait"]} sizes="(min-width: 768px) 40vw, 100vw" priority />
          </div>
        </div>
      </section>

      <section className="bg-cream">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-20 md:grid-cols-2 md:px-8 md:py-28">
          <div className="relative aspect-[3/2] overflow-hidden bg-sand" data-reveal>
            <MediaImage media={images["visit.studio"]} sizes="(min-width: 768px) 45vw, 100vw" />
          </div>
          <div data-reveal>
            <h2 className="display text-4xl md:text-5xl">{content["about.studio"].title ?? "The studio"}</h2>
            <p className="mt-6 leading-relaxed text-taupe">{content["about.studio"].body}</p>
            <h3 className="mt-10 text-sm font-medium">Where</h3>
            <p className="mt-2 leading-relaxed">Based in {s.publicLocation}. Your appointment address will be provided once your booking is confirmed.</p>
            <h3 className="mt-8 text-sm font-medium">Opening hours</h3>
            <dl className="mt-3 grid max-w-xs grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[0.95rem]">
              {hours.map((h) => (
                <div key={h.day} className="contents">
                  <dt className="text-taupe">{h.day}</dt>
                  <dd className="tabular-nums">{h.hours ?? "Closed"}</dd>
                </div>
              ))}
            </dl>
            <Link href="/book" className="btn btn-primary mt-10">Book an appointment</Link>
          </div>
        </div>
      </section>
    </>
  );
}
