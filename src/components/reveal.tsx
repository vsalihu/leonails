"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Opts [data-reveal] elements into a one-time fade/rise as they enter the
 * viewport. Content is fully visible without JavaScript, and reduced-motion
 * users get no movement (handled in CSS).
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    if (!("IntersectionObserver" in window)) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)"));
    // Anything already on screen is shown immediately so nothing flashes.
    const vh = window.innerHeight;
    for (const el of els) if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add("is-visible");
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of els) if (!el.classList.contains("is-visible")) io.observe(el);
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
