"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/treatments", label: "Treatments", note: "Menu and prices" },
  { href: "/gallery", label: "Gallery", note: "Recent work" },
  { href: "/reviews", label: "Reviews", note: "Kind words" },
  { href: "/about", label: "About", note: "The studio" },
  { href: "/contact", label: "Contact", note: "Questions welcome" },
];

type Tone = "light" | "film" | "menu";

/**
 * Fashion-house header: split navigation around a spaced wordmark. Over the
 * homepage film it is transparent with ivory type, and becomes the ivory bar
 * once the film has scrolled away. On phones and tablets a "Menu" control
 * unrolls a full-screen night panel with large serif links.
 *
 * The panel is rendered beside the header, not inside it: the header's
 * backdrop blur would otherwise become the containing block for the fixed
 * panel and squash it into the header's 64px.
 */
export function SiteHeader({
  businessName,
  publicLocation,
  contactEmail,
  instagramHandle,
  filmHero,
}: {
  businessName: string;
  publicLocation: string;
  contactEmail: string | null;
  instagramHandle: string | null;
  filmHero: boolean;
}) {
  const pathname = usePathname();
  // The menu is open for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [pastFilm, setPastFilm] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [first, ...rest] = businessName.split(" ");
  const overFilm = filmHero && pathname === "/";
  const tone: Tone = open ? "menu" : overFilm && !pastFilm ? "film" : "light";
  const instagram = instagramHandle?.replace(/^@/, "") ?? null;

  // Over the film: stay transparent until the film has scrolled under the header.
  useEffect(() => {
    if (!overFilm) return;
    const check = () => {
      const film = document.querySelector(".hero-film");
      const h = headerRef.current?.offsetHeight ?? 64;
      setPastFilm(!film || film.getBoundingClientRect().bottom <= h + 1);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [overFilm]);

  // Open menu: lock scroll, make the page behind inert, Escape closes, close at desktop width.
  useEffect(() => {
    if (!open) return;
    const header = headerRef.current;
    const menu = menuRef.current;
    // Everything beside the header and the panel (main, footer, booking bar) is taken out of focus order.
    const siblings = Array.from(header?.parentElement?.children ?? []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== header && el !== menu && el.tagName !== "SCRIPT",
    );
    siblings.forEach((el) => el.setAttribute("inert", ""));
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        toggleRef.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => mq.matches && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    const t = window.setTimeout(() => menu?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true }), 120);
    return () => {
      window.clearTimeout(t);
      siblings.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      <header ref={headerRef} data-tone={tone} className="site-header sticky top-0 z-[var(--z-nav)]">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
          Skip to content
        </a>
        <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 md:h-[4.75rem] md:px-8">
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-10">
              {NAV.slice(0, 3).map((n) => (
                <li key={n.href}><NavLink href={n.href} label={n.label} pathname={pathname} /></li>
              ))}
            </ul>
          </nav>

          <button
            ref={toggleRef}
            type="button"
            className="menu-toggle -ml-1 inline-flex min-h-11 items-center gap-3 justify-self-start pr-2 lg:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            <span className="menu-toggle-icon" aria-hidden>
              <span />
              <span />
            </span>
            <span className="menu-toggle-label" aria-hidden>
              <span>Menu</span>
              <span>Close</span>
            </span>
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>

          <Link href="/" className="flex flex-col items-center leading-none" aria-label={`${businessName}, home`}>
            <span className="wordmark text-[1.35rem] md:text-[1.7rem]">{first}</span>
            {rest.length > 0 && <span className="site-header-sub mt-1.5 text-[0.55rem] font-medium uppercase tracking-[0.42em] md:text-[0.6rem]">{rest.join(" ")}</span>}
          </Link>

          <div className="flex items-center justify-end gap-10">
            <nav aria-label="Secondary" className="hidden lg:block">
              <ul className="flex items-center gap-10">
                {NAV.slice(3).map((n) => (
                  <li key={n.href}><NavLink href={n.href} label={n.label} pathname={pathname} /></li>
                ))}
              </ul>
            </nav>
            <Link href="/book" className="site-header-book btn btn-sm hidden sm:inline-flex">
              Book an appointment
            </Link>
          </div>
        </div>
      </header>

      <div
        id="site-menu"
        ref={menuRef}
        data-open={open || undefined}
        inert={!open}
        className="site-menu on-night fixed inset-0 z-[var(--z-menu)] bg-night text-ivory lg:hidden"
      >
        <div className="leopard-dark absolute inset-y-0 left-0 w-1.5" aria-hidden />
        <div className="flex h-full flex-col overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-7 pr-6 pt-[calc(4rem+1.75rem)] md:pl-10 md:pr-8 md:pt-[calc(4.75rem+2.5rem)]">
          <nav aria-label="Menu" className="flex-1">
            <ol className="site-menu-list">
              {NAV.map((n, i) => {
                const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
                return (
                  <li key={n.href} style={{ ["--i" as string]: i }}>
                    <Link href={n.href} aria-current={active ? "page" : undefined} className="site-menu-link group">
                      <span className="site-menu-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                      <span className="site-menu-word">{n.label}</span>
                      <span className="site-menu-note">{n.note}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="site-menu-foot" style={{ ["--i" as string]: NAV.length }}>
            <dl className="grid grid-cols-2 gap-6 border-t border-ivory/15 pt-6 text-sm leading-relaxed text-ivory/75">
              <div>
                <dt className="eyebrow mb-2 text-champagne-light">Studio</dt>
                <dd>{publicLocation}<br />By appointment</dd>
              </div>
              {(contactEmail || instagram) && (
                <div>
                  <dt className="eyebrow mb-2 text-champagne-light">Say hello</dt>
                  <dd className="grid gap-1">
                    {instagram && <a className="underline-offset-4 hover:underline" href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">@{instagram}</a>}
                    {contactEmail && <a className="break-all underline-offset-4 hover:underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>}
                  </dd>
                </div>
              )}
            </dl>
            <Link href="/book" className="btn btn-light mt-7 w-full">Book an appointment</Link>
          </div>
        </div>
      </div>
    </>
  );
}

/** Spaced capitals that roll over to the same word in Bodoni italic; the current page stays in italic. */
function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`nav-roll ${active ? "is-active" : ""}`}>
      <span className="nav-roll-track">
        <span className="nav-roll-caps">{label}</span>
        <span className="nav-roll-serif" aria-hidden>{label}</span>
      </span>
    </Link>
  );
}
