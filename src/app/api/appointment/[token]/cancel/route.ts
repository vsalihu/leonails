import { z } from "zod";
import { cancelBooking } from "@/lib/server/bookings";
import { bookingFromToken } from "@/lib/server/appointment-api";
import { assertSameOrigin, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { kickWorker } from "@/lib/server/notifications/worker";

const body = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const { token } = await ctx.params;
  const r = await bookingFromToken(token);
  if ("error" in r) return r.error;
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  try {
    await cancelBooking(r.booking.id, { type: "customer", id: null }, { reason: data.reason ? `Customer: ${data.reason}` : "Cancelled by customer online" });
    kickWorker();
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
