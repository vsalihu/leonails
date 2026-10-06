"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { List, X } from "@phosphor-icons/react";

const NAV = [
  { href: "/treatments", label: "Treatments" },
  { href: "/gallery", label: "Gallery" },
  { href: "/reviews", label: "Reviews" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  // The menu is open for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [first, ...rest] = businessName.split(" ");

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-[var(--z-nav)] border-b border-ink/10 bg-ivory/90 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/80">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      {/* Fashion-house layout: split navigation, centred spaced wordmark. */}
      <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 md:h-[4.75rem] md:px-8">
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {NAV.slice(0, 3).map((n) => (
              <li key={n.href}><NavLink href={n.href} label={n.label} pathname={pathname} /></li>
            ))}
          </ul>
        </nav>
        <button
          ref={toggleRef}
          type="button"
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center justify-self-start lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} weight="light" aria-hidden /> : <List size={22} weight="light" aria-hidden />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>

        <Link href="/" className="group flex flex-col items-center leading-none" aria-label={`${businessName}, home`}>
          <span className="wordmark text-[1.35rem] md:text-[1.7rem]">{first}</span>
          {rest.length > 0 && <span className="mt-1.5 text-[0.55rem] font-medium uppercase tracking-[0.42em] text-taupe md:text-[0.6rem]">{rest.join(" ")}</span>}
        </Link>

        <div className="flex items-center justify-end gap-9">
          <nav aria-label="Secondary" className="hidden lg:block">
            <ul className="flex items-center gap-9">
              {NAV.slice(3).map((n) => (
                <li key={n.href}><NavLink href={n.href} label={n.label} pathname={pathname} /></li>
              ))}
            </ul>
          </nav>
          <Link href="/book" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Book an appointment
          </Link>
        </div>
      </div>

      {open && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="fixed inset-x-0 bottom-0 top-16 z-[var(--z-overlay)] flex flex-col overflow-y-auto bg-ivory px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 lg:hidden"
        >
          <nav aria-label="Mobile" className="flex-1">
            <ul className="divide-y divide-line">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="display flex min-h-[4.5rem] items-center text-[2.4rem]" aria-current={pathname === n.href ? "page" : undefined}>
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="leopard-light mt-8 h-2 w-full" aria-hidden />
          <Link href="/book" className="btn btn-primary mt-6 w-full">
            Book an appointment
          </Link>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "is-active" : ""}`}>
      {label}
    </Link>
  );
}
