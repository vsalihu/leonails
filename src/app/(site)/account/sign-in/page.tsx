import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInFlow } from "@/components/account/sign-in-flow";
import { currentCustomer } from "@/lib/server/customer-auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/** Only same-site paths are allowed as a return address. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/account";
}

const PERKS = [
  ["Book again in two taps", "Your usual treatment and extras, ready to go."],
  ["No forms, no codes", "Your details are filled in when you book."],
  ["Everything in one place", "Upcoming and past appointments, always to hand."],
];

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentCustomer()) redirect(next);
  return (
    <div className="grid lg:min-h-[calc(100svh-4.75rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <aside className="on-night relative overflow-hidden bg-night px-4 py-12 text-ivory md:px-8 lg:flex lg:flex-col lg:justify-between lg:py-16 lg:pl-[max(2rem,calc((100vw-1440px)/2+2rem))] lg:pr-16">
        <div className="leopard-dark absolute inset-y-0 right-0 w-2 max-lg:hidden" aria-hidden />
        <div>
          <p className="eyebrow flex items-center gap-4 text-champagne-light">
            <span className="h-px w-10 bg-champagne-light/70" aria-hidden />
            Client account
          </p>
          <h1 className="display mt-6 text-[2.6rem] leading-[1.04] md:text-6xl">
            Your appointments,
            <span className="display-italic block text-champagne-light">remembered.</span>
          </h1>
        </div>
        <ol className="mt-10 grid gap-6 border-t border-ivory/15 pt-8 max-lg:hidden">
          {PERKS.map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <span className="pt-1 text-[0.66rem] font-medium tracking-[0.2em] text-champagne-light tabular-nums" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block font-display text-2xl">{t}</span>
                <span className="mt-1 block text-sm text-ivory/65">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
      <div className="px-4 py-12 md:px-8 lg:flex lg:items-center lg:px-16 lg:py-16">
        <div className="w-full max-w-md">
          <SignInFlow next={next} />
          <p className="mt-10 border-t border-line pt-6 text-sm text-taupe">
            An account is optional. You can always book as a guest.
          </p>
        </div>
      </div>
    </div>
  );
}
