import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { publicSettings } from "@/lib/server/public-content";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const s = await publicSettings();
  return (
    <div className="mx-auto grid max-w-[1400px] gap-14 px-4 pb-24 pt-12 md:grid-cols-[1fr_1.1fr] md:px-8 md:pt-20">
      <div>
        <h1 className="display text-5xl md:text-7xl">Contact</h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-taupe">
          Questions about a treatment, a design or availability? Send a message. To book, the quickest way is{" "}
          <Link href="/book" className="link-underline text-ink">online</Link>.
        </p>
        <div className="mt-10 space-y-2 text-[0.95rem]">
          <p>Based in {s.publicLocation}. The appointment address is shared once your booking is confirmed.</p>
          {s.contactEmail && <p>Email <a className="link-underline" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a></p>}
          {s.contactPhone && <p>Phone <a className="link-underline" href={`tel:${s.contactPhone.replace(/\s/g, "")}`}>{s.contactPhone}</a></p>}
        </div>
        <div className="leopard-light mt-12 hidden h-40 w-full max-w-sm md:block" aria-hidden />
      </div>
      <ContactForm />
    </div>
  );
}
