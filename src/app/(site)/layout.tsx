import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyBook } from "@/components/sticky-book";
import { RevealObserver } from "@/components/reveal";
import { publicSettings } from "@/lib/server/public-content";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await publicSettings();
  return (
    <>
      <SiteHeader businessName={s.businessName} />
      <main id="main">{children}</main>
      <SiteFooter s={s} />
      <StickyBook />
      <RevealObserver />
    </>
  );
}
