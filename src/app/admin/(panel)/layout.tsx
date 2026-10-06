import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { sql } from "@/lib/server/db";
import { logoutAction } from "../actions";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const [c] = await sql()`
    SELECT
      (SELECT count(*)::int FROM testimonials WHERE status = 'pending') AS reviews,
      (SELECT count(*)::int FROM enquiries WHERE status = 'new') + (SELECT count(*)::int FROM notification_jobs WHERE status = 'failed') AS messages,
      (SELECT count(*)::int FROM bookings WHERE needs_review AND status = 'confirmed') AS flagged`;
  const badges = { "/admin/reviews": c.reviews, "/admin/messages": c.messages, "/admin/bookings": c.flagged };
  return (
    <div className="min-h-dvh bg-ivory">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[var(--z-overlay)] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">Skip to content</a>
      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-line lg:block">
          <div className="sticky top-0 flex h-dvh flex-col p-4">
            <Link href="/admin" className="display px-3 py-3 text-2xl">Admin</Link>
            <div className="mt-4 flex-1"><AdminNav variant="side" badges={badges} /></div>
            <div className="border-t border-line px-3 pt-4 text-sm">
              <p className="truncate text-taupe">{admin.name}</p>
              <div className="mt-2 flex gap-4">
                <Link href="/" className="underline underline-offset-4">View site</Link>
                <form action={logoutAction}><button type="submit" className="underline underline-offset-4">Sign out</button></form>
              </div>
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-[var(--z-nav)] border-b border-line bg-ivory/95 px-4 pt-3 backdrop-blur-sm lg:hidden">
            <div className="flex items-center justify-between pb-1">
              <Link href="/admin" className="display text-xl">Admin</Link>
              <form action={logoutAction}><button type="submit" className="min-h-11 text-sm underline underline-offset-4">Sign out</button></form>
            </div>
            <AdminNav variant="top" badges={badges} />
          </header>
          <main id="admin-main" className="px-4 pb-24 pt-6 md:px-8 md:pt-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
