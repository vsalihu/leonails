import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyBook } from "@/components/sticky-book";
import { RevealObserver } from "@/components/reveal";
import { heroVideos, publicSettings } from "@/lib/server/public-content";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, film] = await Promise.all([publicSettings(), heroVideos()]);
  return (
    <>
      <SiteHeader
        businessName={s.businessName}
        publicLocation={s.publicLocation}
        contactEmail={s.contactEmail}
        instagramHandle={s.instagramHandle}
        filmHero={!!(film.desktop || film.mobile)}
      />
      <main id="main">{children}</main>
      <SiteFooter s={s} />
      <StickyBook />
      <RevealObserver />
    </>
  );
}
