"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center px-4 py-24 md:px-8">
      <h1 className="display text-5xl">Something went wrong</h1>
      <p className="mt-5 text-lg text-taupe">
        Sorry, this page couldn&apos;t load. If you were booking, check your email for a confirmation before trying again. Otherwise, please try again in a moment.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn btn-outline">Go to the homepage</Link>
      </div>
    </main>
  );
}
