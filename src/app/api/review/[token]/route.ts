import { z } from "zod";
import { sql } from "@/lib/server/db";
import { bookingIdForToken } from "@/lib/server/booking-access";
import { assertSameOrigin, errorJson, json } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";
import { ImageError, insertMedia, processImage, MAX_UPLOAD_BYTES } from "@/lib/server/images";
import { audit } from "@/lib/server/audit";

const fields = z.object({
  displayName: z.string().trim().min(2, "Please enter the name to show with your review.").max(60),
  quote: z.string().trim().min(10, "Please write a little more.").max(600, "Please keep your review under 600 characters."),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  consent: z.literal("yes", { message: "Please confirm I may publish your review." }),
});

/**
 * POST /api/review/:token (multipart). One review per completed booking,
 * always stored as pending until Rugile approves it.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  if (!(await rateLimit(`review:${await clientIpHash()}`, 10, 3600))) return errorJson("Too many attempts. Please try again later.", 429);
  const { token } = await ctx.params;
  const bookingId = await bookingIdForToken(token, "review");
  if (!bookingId) return errorJson("This review link is invalid or has expired.", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson("Your review couldn't be read. Please try again.", 400);
  }
  const parsed = fields.safeParse({
    displayName: form.get("displayName"),
    quote: form.get("quote"),
    rating: form.get("rating") || undefined,
    consent: form.get("consent"),
  });
  if (!parsed.success) {
    return errorJson(parsed.error.issues[0].message, 422, { fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
  }

  const db = sql();
  const [b] = await db`SELECT status FROM bookings WHERE id = ${bookingId}`;
  if (b?.status !== "completed") return errorJson("Reviews can be left after a completed appointment.", 409);
  const [existing] = await db`SELECT id FROM testimonials WHERE booking_id = ${bookingId}`;
  if (existing) return errorJson("Thank you, you've already left a review for this appointment.", 409);

  let mediaId: number | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_UPLOAD_BYTES) return errorJson("Photos must be 15 MB or smaller.", 422, { fields: { photo: "Photos must be 15 MB or smaller." } });
    try {
      const img = await processImage(Buffer.from(await photo.arrayBuffer()), "testimonial");
      mediaId = await insertMedia(db, img, { usage: "testimonial", altText: `Nails photographed by ${parsed.data.displayName}`, isPublished: false, provenance: "Uploaded by the customer with a review" });
    } catch (err) {
      if (err instanceof ImageError) return errorJson(err.message, 422, { fields: { photo: err.message } });
      throw err;
    }
  }

  try {
    await db.begin(async (tx) => {
      const [t] = await tx`
        INSERT INTO testimonials (display_name, quote, rating, media_id, booking_id, source, status, consent_given_at, consent_note)
        VALUES (${parsed.data.displayName}, ${parsed.data.quote}, ${parsed.data.rating ?? null}, ${mediaId}, ${bookingId}, 'customer', 'pending', now(),
                'Customer ticked consent to publish on the review form')
        RETURNING id`;
      await audit(tx, { type: "customer", id: null }, "testimonial.submitted", "testimonial", t.id, { details: { bookingId } });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return errorJson("Thank you, you've already left a review for this appointment.", 409);
    throw err;
  }
  return json({ received: true });
}
