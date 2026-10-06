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
    <header className="sticky top-0 z-[var(--z-nav)] border-b border-line/70 bg-ivory/92 backdrop-blur-sm supports-[backdrop-filter]:bg-ivory/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-6 px-4 md:h-[4.5rem] md:px-8">
        <Link href="/" className="flex items-baseline gap-2 leading-none" aria-label={`${businessName}, home`}>
          <span className="display text-[1.65rem] md:text-[1.85rem]">{first}</span>
          {rest.length > 0 && <span className="eyebrow hidden text-[0.62rem] text-taupe xs:inline">{rest.join(" ")}</span>}
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8 text-[0.9rem]">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href}>
                  <Link href={n.href} aria-current={active ? "page" : undefined} className={`py-2 transition-colors hover:text-champagne-text ${active ? "link-underline" : ""}`}>
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/book" className="btn btn-primary hidden h-11 min-h-0 px-5 sm:inline-flex">
            Book an appointment
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={24} weight="light" aria-hidden /> : <List size={24} weight="light" aria-hidden />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
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
                  <Link href={n.href} className="display flex min-h-16 items-center text-3xl" aria-current={pathname === n.href ? "page" : undefined}>
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
