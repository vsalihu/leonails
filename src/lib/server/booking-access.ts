import "server-only";
import { sql, type Db } from "./db";
import { sha256 } from "./crypto";
import { getPrivateLocation } from "./private-location";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

/**
 * Resolves a customer link token to its booking id. Booking ids alone never
 * grant access: without a matching, unexpired, unrevoked token hash this
 * returns null.
 */
export async function bookingIdForToken(token: string, purpose: "manage" | "review", db: Db = sql()): Promise<number | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const [r] = await db`
    SELECT booking_id FROM booking_access_tokens
    WHERE token_hash = ${sha256(token)} AND purpose = ${purpose} AND revoked_at IS NULL AND expires_at > now()`;
  return r?.booking_id ?? null;
}

export type CustomerBookingView = {
  id: number;
  reference: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerEmail: string;
  items: { name: string; kind: string; pricePence: number; durationMinutes: number }[];
  subtotalPence: number;
  discountPence: number;
  totalPence: number;
  promotionName: string | null;
  /** Present only for confirmed bookings. */
  address: { lines: string; postcode: string | null; arrival: string | null } | null;
};

export async function customerBookingView(bookingId: number, db: Db = sql()): Promise<CustomerBookingView | null> {
  const [b] = await db`SELECT * FROM bookings WHERE id = ${bookingId}`;
  if (!b) return null;
  const items = await db`SELECT name, kind, price_pence, duration_minutes FROM booking_items WHERE booking_id = ${bookingId} ORDER BY sort_order, id`;
  let address: CustomerBookingView["address"] = null;
  if (b.status === "confirmed") {
    const loc = await getPrivateLocation(db);
    if (loc) address = { lines: loc.addressLines, postcode: loc.postcode, arrival: loc.arrivalInstructions };
  }
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    customerName: b.customer_name,
    customerEmail: b.customer_email,
    items: items.map((i) => ({ name: i.name, kind: i.kind, pricePence: i.price_pence, durationMinutes: i.duration_minutes })),
    subtotalPence: b.subtotal_pence,
    discountPence: b.discount_pence,
    totalPence: b.total_pence,
    promotionName: b.promotion_snapshot?.name ?? null,
    address,
  };
}

/** Mints a manage token immediately (used right after an online confirmation). */
export async function mintManageToken(bookingId: number, startsAt: Date, db: Db = sql()): Promise<string> {
  const { newToken } = await import("./crypto");
  const token = newToken();
  const expires = new Date(Math.max(startsAt.getTime(), Date.now()) + 30 * 86_400_000);
  await db`INSERT INTO booking_access_tokens (token_hash, booking_id, purpose, expires_at) VALUES (${sha256(token)}, ${bookingId}, 'manage', ${expires})`;
  return token;
}

export async function revokeTokens(bookingId: number, db: Db = sql()) {
  await db`UPDATE booking_access_tokens SET revoked_at = now() WHERE booking_id = ${bookingId} AND revoked_at IS NULL`;
}
