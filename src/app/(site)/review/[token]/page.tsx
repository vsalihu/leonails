import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bookingIdForToken } from "@/lib/server/booking-access";
import { sql } from "@/lib/server/db";
import { ReviewForm } from "@/components/review-form";

export const metadata: Metadata = { title: "Leave a review", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = await bookingIdForToken(token, "review");
  if (!id) notFound();
  const [b] = await sql()`SELECT customer_name, status FROM bookings WHERE id = ${id}`;
  const [existing] = await sql()`SELECT 1 FROM testimonials WHERE booking_id = ${id}`;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-12 md:px-8 md:pt-20">
      <h1 className="display text-5xl">How were your nails?</h1>
      {existing ? (
        <p className="mt-6 text-lg text-taupe">Thank you, you&apos;ve already left a review for this appointment.</p>
      ) : b.status !== "completed" ? (
        <p className="mt-6 text-lg text-taupe">Reviews can be left after a completed appointment.</p>
      ) : (
        <>
          <p className="mt-6 text-lg text-taupe">Thank you for visiting. Your review is read before anything is published.</p>
          <div className="mt-10">
            <ReviewForm token={token} defaultName={String(b.customer_name).split(" ")[0]} />
          </div>
        </>
      )}
    </div>
  );
}
