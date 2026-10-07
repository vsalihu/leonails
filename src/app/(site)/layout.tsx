import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyBook } from "@/components/sticky-book";
import { RevealObserver } from "@/components/reveal";
import { announcementRibbon, heroVideos, publicSettings } from "@/lib/server/public-content";
import { AnnouncementRibbon } from "@/components/announcement-ribbon";
import { currentCustomer } from "@/lib/server/customer-auth";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, film, me, ribbon] = await Promise.all([publicSettings(), heroVideos(), currentCustomer(), announcementRibbon()]);
  return (
    <>
      {/* first in the tab order, before the ribbon and the header */}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      {ribbon && <AnnouncementRibbon messages={ribbon} />}
      <SiteHeader
        businessName={s.businessName}
        publicLocation={s.publicLocation}
        contactEmail={s.contactEmail}
        instagramHandle={s.instagramHandle}
        filmHero={!!(film.desktop || film.mobile)}
        signedInAs={me ? me.name.split(" ")[0] : null}
      />
      <main id="main">{children}</main>
      <SiteFooter s={s} />
      <StickyBook />
      <RevealObserver />
    </>
  );
}
