"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { done, fail, fd, type ActionState } from "@/lib/server/action";
import { sql } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { enqueue } from "@/lib/server/notifications/outbox";
import { kickWorker } from "@/lib/server/notifications/worker";

function refresh() {
  revalidatePath("/admin/reviews");
  revalidatePath("/reviews");
  revalidatePath("/");
}

export async function moderateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "id")!;
  const op = fd.str(form, "op");
  const db = sql();
  const [t] = await db`SELECT * FROM testimonials WHERE id = ${id}`;
  if (!t) return fail("Review not found.");
  switch (op) {
    case "approve":
      if (!t.consent_given_at) return fail("This review has no recorded consent to publish.");
      await db`UPDATE testimonials SET status = 'approved', moderated_at = now(), moderated_by = ${admin.id} WHERE id = ${id}`;
      if (t.media_id && fd.bool(form, "withPhoto")) await db`UPDATE media_assets SET is_published = true WHERE id = ${t.media_id}`;
      break;
    case "reject":
      await db`UPDATE testimonials SET status = 'rejected', is_featured = false, moderated_at = now(), moderated_by = ${admin.id} WHERE id = ${id}`;
      break;
    case "hide":
      await db`UPDATE testimonials SET status = 'hidden', is_featured = false, moderated_at = now(), moderated_by = ${admin.id} WHERE id = ${id}`;
      break;
    case "feature":
      if (t.status !== "approved") return fail("Approve the review before featuring it.");
      await db`UPDATE testimonials SET is_featured = NOT is_featured WHERE id = ${id}`;
      break;
    case "delete":
      await db`DELETE FROM testimonials WHERE id = ${id}`;
      break;
    default:
      return fail("Unknown action.");
  }
  await audit(db, { type: "admin", id: admin.id }, `testimonial.${op}`, "testimonial", id);
  refresh();
  return done("Updated.");
}

export async function addTestimonialAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const name = fd.str(form, "name");
  const quote = fd.str(form, "quote");
  const consent = fd.str(form, "consent");
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter a display name.";
  if (quote.length < 10) errors.quote = "Enter the review.";
  if (consent.length < 5) errors.consent = "Record how the client agreed to publication.";
  if (Object.keys(errors).length) return fail("Please check the form.", errors);
  const rating = fd.int(form, "rating");
  const mediaId = fd.int(form, "mediaId");
  const [r] = await sql()`
    INSERT INTO testimonials (display_name, quote, rating, media_id, source, status, consent_given_at, consent_note, moderated_at, moderated_by)
    VALUES (${name}, ${quote}, ${rating && rating >= 1 && rating <= 5 ? rating : null}, ${mediaId}, 'admin', 'approved', now(), ${consent}, now(), ${admin.id})
    RETURNING id`;
  await audit(sql(), { type: "admin", id: admin.id }, "testimonial.created", "testimonial", r.id);
  refresh();
  return done("Review added and published.");
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = fd.int(form, "bookingId")!;
  const [b] = await sql()`SELECT customer_email, status FROM bookings WHERE id = ${id}`;
  if (!b || b.status !== "completed") return fail("Only completed appointments can be invited to review.");
  const jobId = await enqueue(sql(), { kind: "review_invite", dedupeKey: `review-invite:${id}`, recipient: b.customer_email, bookingId: id });
  if (!jobId) return fail("An invitation has already been sent for this appointment.");
  await audit(sql(), { type: "admin", id: admin.id }, "testimonial.invited", "booking", id);
  kickWorker();
  revalidatePath("/admin/reviews");
  return done("Invitation queued.");
}
