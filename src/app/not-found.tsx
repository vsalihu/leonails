import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center px-4 py-24 md:px-8">
      <p className="eyebrow text-champagne-text">Page not found</p>
      <h1 className="display mt-4 text-5xl">This page isn&apos;t here</h1>
      <p className="mt-5 text-lg text-taupe">
        The link may be mistyped, or it may have expired. If you followed a link to your appointment, use the most recent email you received.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">Go to the homepage</Link>
        <Link href="/contact" className="btn btn-outline">Get in touch</Link>
      </div>
    </main>
  );
}
