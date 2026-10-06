import { z } from "zod";
import { createHold, releaseSessionHolds, BookingError } from "@/lib/server/holds";
import { sql } from "@/lib/server/db";
import { assertSameOrigin, checkoutSession, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";

const body = z.object({
  treatmentId: z.number().int().positive(),
  extraIds: z.array(z.number().int().positive()).max(10),
  startsAt: z.string().datetime(),
});

/** POST /api/booking/hold: reserve a time for this checkout (releases any previous hold). */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  const ip = await clientIpHash();
  if (!(await rateLimit(`hold:${ip}`, 30, 3600))) {
    return handleError(new BookingError("You've reserved a lot of times in a short while. Please wait a few minutes and try again.", "rate_limited"));
  }
  try {
    const session = (await checkoutSession())!;
    const hold = await createHold({ sessionId: session, treatmentId: data.treatmentId, extraIds: data.extraIds, startsAt: new Date(data.startsAt), ipHash: ip });
    return json({ hold });
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/booking/hold: release this checkout's hold (going back to pick another time). */
export async function DELETE() {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const session = await checkoutSession(false);
  if (session) await releaseSessionHolds(sql(), session);
  return json({ ok: true });
}
