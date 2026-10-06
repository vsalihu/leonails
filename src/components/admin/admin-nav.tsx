"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV = [
  { href: "/admin", label: "Today" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/treatments", label: "Treatments" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/gallery", label: "Gallery" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav({ variant, badges = {} }: { variant: "side" | "top"; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  if (variant === "top") {
    return (
      <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex gap-1 pb-1">
          {ADMIN_NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 text-sm ${isActive(n.href) ? "border-b-2 border-ink font-medium" : "text-taupe"}`}
              >
                {n.label}
                {badges[n.href] ? <span className="bg-ink px-1.5 text-[0.7rem] text-ivory">{badges[n.href]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Admin">
      <ul className="space-y-0.5">
        {ADMIN_NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`flex items-center justify-between px-3 py-2 text-[0.95rem] ${isActive(n.href) ? "bg-ink text-ivory" : "hover:bg-cream"}`}
            >
              {n.label}
              {badges[n.href] ? <span className={`px-1.5 text-xs ${isActive(n.href) ? "bg-ivory text-ink" : "bg-ink text-ivory"}`}>{badges[n.href]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
