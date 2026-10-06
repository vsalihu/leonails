import { z } from "zod";
import { confirmBooking } from "@/lib/server/bookings";
import { mintManageToken } from "@/lib/server/booking-access";
import { sql } from "@/lib/server/db";
import { assertSameOrigin, checkoutSession, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";
import { kickWorker } from "@/lib/server/notifications/worker";

const body = z.object({
  holdId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a phone number we can reach you on.")
    .max(30)
    .regex(/^[+\d][\d\s()-]{6,}$/, "Please enter a valid phone number."),
  notes: z.string().trim().max(1000).optional().nullable(),
  code: z.string().trim().max(40).optional().nullable(),
  expectedTotalPence: z.number().int().min(0),
  acceptedTerms: z.literal(true, { message: "Please confirm you've read the booking terms and cancellation policy." }),
});

/** POST /api/booking/confirm: turn the verified hold into a confirmed booking. */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  if (!(await rateLimit(`confirm:${await clientIpHash()}`, 20, 3600))) return errorJson("Too many attempts. Please wait a while and try again.", 429);
  const session = await checkoutSession(false);
  if (!session) return errorJson("Your session has expired. Please choose a time again.", 410, { code: "hold_expired" });
  try {
    const result = await confirmBooking({
      holdPublicId: data.holdId,
      sessionId: session,
      idempotencyKey: data.idempotencyKey,
      name: data.name,
      email: data.email,
      phone: data.phone,
      notes: data.notes || null,
      code: data.code || null,
      expectedTotalPence: data.expectedTotalPence,
    });
    kickWorker();
    const [b] = await sql()`SELECT starts_at FROM bookings WHERE id = ${result.bookingId}`;
    const token = await mintManageToken(result.bookingId, b.starts_at);
    return json({ reference: result.reference, manageUrl: `/appointment/${token}?confirmed=1` });
  } catch (err) {
    return handleError(err);
  }
}
