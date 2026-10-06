import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLatestPolicy, type PolicyKind } from "@/lib/server/settings";

const KINDS: Record<string, { kind: PolicyKind; title: string }> = {
  cancellation: { kind: "cancellation", title: "Cancellation policy" },
  "booking-terms": { kind: "booking_terms", title: "Booking terms" },
  privacy: { kind: "privacy", title: "Privacy" },
};

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  return { title: KINDS[kind]?.title ?? "Policy" };
}

export default async function PolicyPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const meta = KINDS[kind];
  if (!meta) notFound();
  const policy = await getLatestPolicy(meta.kind);
  return (
    <article className="mx-auto max-w-2xl px-4 pb-24 pt-12 md:px-8 md:pt-20">
      <h1 className="display text-5xl">{meta.title}</h1>
      {policy ? (
        <>
          <div className="mt-10 space-y-5 text-[1.05rem] leading-relaxed">
            {policy.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
          </div>
          <p className="mt-12 text-sm text-taupe">
            Version {policy.version}, updated {policy.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}.
          </p>
        </>
      ) : (
        <p className="mt-8 text-taupe">This policy is being written. Please get in touch with any questions.</p>
      )}
    </article>
  );
}
