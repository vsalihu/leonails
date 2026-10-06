import { z } from "zod";
import { sql } from "@/lib/server/db";
import { resolveSelection } from "@/lib/server/catalogue";
import { quoteBooking } from "@/lib/server/promotions";
import { getSettings } from "@/lib/server/settings";
import { localDateOf } from "@/lib/availability";
import { assertSameOrigin, checkoutSession, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";

const body = z.object({
  treatmentId: z.number().int().positive(),
  extraIds: z.array(z.number().int().positive()).max(10),
  startsAt: z.string().datetime().optional(),
  code: z.string().trim().max(40).optional().nullable(),
  holdId: z.string().uuid().optional(),
});

/**
 * POST /api/booking/quote: authoritative price. Customer-specific eligibility
 * (first visit, per-customer limits) is only evaluated once the checkout's
 * email has been verified, so the endpoint can't be used to probe whether an
 * email address has booked before.
 */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  if (!(await rateLimit(`quote:${await clientIpHash()}`, 120, 600))) return errorJson("Too many requests. Please wait a moment.", 429);
  try {
    const db = sql();
    const settings = await getSettings();
    const lines = await resolveSelection(data.treatmentId, data.extraIds);
    let customer: { id: number | null; phoneNormalised: string | null } | null = null;
    const session = await checkoutSession(false);
    if (data.holdId && session) {
      const [h] = await db`SELECT email, email_verified_at FROM slot_holds WHERE public_id = ${data.holdId} AND session_id = ${session}`;
      if (h?.email_verified_at) {
        const [c] = await db`SELECT id, phone_normalised FROM customers WHERE email = ${h.email}`;
        customer = { id: c?.id ?? null, phoneNormalised: c?.phone_normalised ?? null };
      }
    }
    const date = data.startsAt ? localDateOf(new Date(data.startsAt), settings.timezone) : localDateOf(new Date(), settings.timezone);
    const quote = await quoteBooking(db, { lines, appointmentLocalDate: date, code: data.code ?? null, customer });
    return json({ quote });
  } catch (err) {
    return handleError(err);
  }
}
