"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Mobile-only booking bar. Hidden in booking/appointment flows so it never covers forms. */
export function StickyBook() {
  const pathname = usePathname();
  if (["/book", "/appointment", "/review", "/contact"].some((p) => pathname.startsWith(p))) return null;
  return (
    <>
      {/* spacer so the bar never covers the end of the page */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-[var(--z-sticky-cta)] border-t border-line bg-ivory/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:hidden">
        <Link href="/book" className="btn btn-primary w-full">
          Book an appointment
        </Link>
      </div>
    </>
  );
}
