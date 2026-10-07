import { currentCustomer } from "@/lib/server/customer-auth";
import { mintManageToken } from "@/lib/server/booking-access";
import { sql } from "@/lib/server/db";
import { assertSameOrigin, errorJson } from "@/lib/server/http";
import { env } from "@/lib/server/env";

/**
 * POST /api/account/manage (form field "booking"): opens the private page for
 * one of the signed-in client's own upcoming bookings with a fresh link.
 */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const me = await currentCustomer();
  if (!me) return Response.redirect(new URL("/account/sign-in", env().APP_URL), 303);
  const id = Number((await req.formData()).get("booking"));
  if (!Number.isInteger(id) || id <= 0) return errorJson("Not found.", 404);
  const [b] = await sql()`SELECT id, starts_at FROM bookings WHERE id = ${id} AND customer_id = ${me.id} AND status = 'confirmed'`;
  if (!b) return errorJson("Not found.", 404);
  const token = await mintManageToken(b.id, b.starts_at);
  return Response.redirect(new URL(`/appointment/${token}`, env().APP_URL), 303);
}
