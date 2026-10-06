import Link from "next/link";

export function SiteFooter({ s }: { s: { businessName: string; publicLocation: string; contactEmail: string | null; contactPhone: string | null; instagramHandle: string | null } }) {
  return (
    <footer className="on-night bg-night text-ivory">
      <div className="leopard-dark h-3 w-full" aria-hidden />
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 md:py-20">
        <div>
          <p className="display text-4xl">{s.businessName}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-nude">
            Based in {s.publicLocation}. Your appointment address will be provided once your booking is confirmed.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="space-y-3 text-sm">
            <li><Link className="hover:text-nude" href="/treatments">Treatments and prices</Link></li>
            <li><Link className="hover:text-nude" href="/gallery">Gallery</Link></li>
            <li><Link className="hover:text-nude" href="/reviews">Reviews</Link></li>
            <li><Link className="hover:text-nude" href="/about">About and visiting</Link></li>
            <li><Link className="hover:text-nude" href="/contact">Contact</Link></li>
          </ul>
        </nav>
        <div className="space-y-3 text-sm">
          {s.contactEmail && <p><a className="hover:text-nude" href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a></p>}
          {s.contactPhone && <p><a className="hover:text-nude" href={`tel:${s.contactPhone.replace(/\s/g, "")}`}>{s.contactPhone}</a></p>}
          {s.instagramHandle && (
            <p><a className="hover:text-nude" href={`https://instagram.com/${s.instagramHandle.replace(/^@/, "")}`} rel="noopener noreferrer" target="_blank">Instagram @{s.instagramHandle.replace(/^@/, "")}</a></p>
          )}
          <ul className="space-y-3 pt-4 text-nude">
            <li><Link className="hover:text-ivory" href="/policies/cancellation">Cancellation policy</Link></li>
            <li><Link className="hover:text-ivory" href="/policies/booking-terms">Booking terms</Link></li>
            <li><Link className="hover:text-ivory" href="/policies/privacy">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] border-t border-ivory/15 px-4 py-6 text-xs text-nude md:px-8">
        © {new Date().getFullYear()} {s.businessName}. Payment is taken at your appointment.
      </div>
    </footer>
  );
}
