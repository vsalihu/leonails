import { z } from "zod";
import { rescheduleBooking } from "@/lib/server/bookings";
import { bookingFromToken } from "@/lib/server/appointment-api";
import { assertSameOrigin, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { kickWorker } from "@/lib/server/notifications/worker";

const body = z.object({ startsAt: z.string().datetime(), acceptPriceChange: z.boolean().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const { token } = await ctx.params;
  const r = await bookingFromToken(token);
  if ("error" in r) return r.error;
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  try {
    const out = await rescheduleBooking(r.booking.id, new Date(data.startsAt), { type: "customer", id: null }, { acceptPriceChange: data.acceptPriceChange });
    if (!out.ok) return json({ needsPriceConfirmation: out.needsPriceConfirmation }, 409);
    kickWorker();
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
