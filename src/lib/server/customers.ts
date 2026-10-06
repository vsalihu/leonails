import "server-only";
import type { Db } from "./db";

/** UK-centric phone normalisation for matching (not display). */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+44")) digits = "0" + digits.slice(3);
  else if (digits.startsWith("0044")) digits = "0" + digits.slice(4);
  digits = digits.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * First-visit eligibility for a verified email identity. Ineligible when that
 * customer has a completed appointment or another active first-visit
 * redemption, or when the same normalised phone number belongs to a completed
 * appointment under another email (identities are not merged; this only
 * withholds the offer). Guest checks reduce abuse but cannot prove uniqueness.
 */
export async function isFirstVisit(db: Db, customerId: number | null, phoneNormalised: string | null): Promise<boolean> {
  if (customerId !== null) {
    const [r] = await db`
      SELECT
        EXISTS (SELECT 1 FROM bookings WHERE customer_id = ${customerId} AND status = 'completed') AS has_completed,
        EXISTS (
          SELECT 1 FROM promotion_redemptions pr JOIN promotions p ON p.id = pr.promotion_id
          WHERE pr.customer_id = ${customerId} AND p.eligibility = 'first_visit' AND pr.status IN ('reserved','consumed')
        ) AS has_first_visit_redemption`;
    if (r.has_completed || r.has_first_visit_redemption) return false;
  }
  if (phoneNormalised) {
    const [r] = await db`
      SELECT EXISTS (
        SELECT 1 FROM bookings b JOIN customers c ON c.id = b.customer_id
        WHERE c.phone_normalised = ${phoneNormalised} AND b.status = 'completed'
          AND c.id IS DISTINCT FROM ${customerId}
      ) AS phone_seen`;
    if (r.phone_seen) return false;
  }
  return true;
}

/** Insert or update the customer for a verified email; locks the row for the transaction. */
export async function upsertCustomerForUpdate(
  db: Db,
  input: { email: string; name: string; phone: string | null; verified: boolean },
) {
  const phoneNorm = normalisePhone(input.phone);
  const [row] = await db`
    INSERT INTO customers (email, name, phone, phone_normalised, email_verified_at)
    VALUES (${normaliseEmail(input.email)}, ${input.name}, ${input.phone}, ${phoneNorm}, ${input.verified ? db`now()` : null})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = COALESCE(EXCLUDED.phone, customers.phone),
      phone_normalised = COALESCE(EXCLUDED.phone_normalised, customers.phone_normalised),
      email_verified_at = COALESCE(customers.email_verified_at, EXCLUDED.email_verified_at),
      updated_at = now()
    RETURNING id`;
  const [locked] = await db`SELECT id, is_blocked, phone_normalised FROM customers WHERE id = ${row.id} FOR UPDATE`;
  return { id: locked.id as number, isBlocked: locked.is_blocked as boolean, phoneNormalised: locked.phone_normalised as string | null };
}
