import "server-only";
import { sql } from "./db";
import { bookingIdForToken } from "./booking-access";
import { errorJson } from "./http";
import { clientIpHash, rateLimit } from "./rate-limit";

/** Resolves a manage token for API routes, with a rate limit against token guessing. */
export async function bookingFromToken(token: string) {
  if (!(await rateLimit(`token:${await clientIpHash()}`, 120, 600))) return { error: errorJson("Too many requests. Please wait a moment.", 429) };
  const id = await bookingIdForToken(token, "manage");
  if (!id) return { error: errorJson("This link is invalid or has expired.", 404) };
  const [b] = await sql()`SELECT id, status, starts_at, ends_at, technician_id FROM bookings WHERE id = ${id}`;
  return { booking: b as { id: number; status: string; starts_at: Date; ends_at: Date; technician_id: number } };
}
