import type { Metadata } from "next";
import { BookingFlow, type FlowTreatment } from "@/components/booking/booking-flow";
import { listTreatments } from "@/lib/server/catalogue";
import { getSettings } from "@/lib/server/settings";
import Link from "next/link";

export const metadata: Metadata = { title: "Book an appointment" };

export default async function BookPage({ searchParams }: { searchParams: Promise<{ treatment?: string }> }) {
  const [{ treatment }, settings, treatments] = await Promise.all([searchParams, getSettings(), listTreatments()]);
  const flow: FlowTreatment[] = treatments.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    notes: t.notes,
    pricePence: t.pricePence,
    durationMinutes: t.durationMinutes,
    category: t.category?.name ?? null,
    extras: t.extras.map((e) => ({ id: e.id, name: e.name, description: e.description, pricePence: e.pricePence, durationMinutes: e.durationMinutes })),
  }));
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 md:px-8 md:pt-14">
      <h1 className="display text-4xl md:text-5xl">Book an appointment</h1>
      <p className="mt-3 max-w-xl text-taupe">No deposit and no account needed. You pay at your appointment.</p>
      <div className="mt-10">
        {!settings.bookingsEnabled ? (
          <div className="max-w-xl border border-line bg-paper p-6">
            <p className="font-medium">Online booking is paused at the moment.</p>
            <p className="mt-2 text-taupe">Please get in touch and I&apos;ll find you a time.</p>
            <Link href="/contact" className="btn btn-outline mt-5">Get in touch</Link>
          </div>
        ) : flow.length === 0 ? (
          <p className="text-taupe">Treatments are being updated. Please check back soon.</p>
        ) : (
          <BookingFlow treatments={flow} initialTreatmentSlug={treatment ?? null} timezone={settings.timezone} holdMinutes={settings.holdMinutes} />
        )}
      </div>
    </div>
  );
}
