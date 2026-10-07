import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { sql } from "./db";
import { env } from "./env";
import { hmac, newToken, safeEqual, sha256 } from "./crypto";
import { enqueue } from "./notifications/outbox";
import { normaliseEmail, normalisePhone } from "./customers";

/**
 * Optional customer accounts. Sign-in is passwordless: a 6-digit code is
 * emailed (minted when the email is rendered, stored only as an HMAC), then a
 * random session token is set in an httpOnly cookie and stored hashed.
 *
 * An account is a customers row with account_created_at set. Guest bookings
 * live in the same table, so earlier bookings appear once that email signs in.
 */
export const CUSTOMER_COOKIE = "client_session";
const SESSION_DAYS = 90;
export const LOGIN_CODE_MINUTES = 15;
export const MAX_LOGIN_ATTEMPTS = 5;
/** After a correct code, how long the "complete your details" step stays open. */
const PROFILE_WINDOW_MINUTES = 30;

export type Customer = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
};

export class AccountError extends Error {
  constructor(
    message: string,
    public code: "invalid_code" | "expired" | "rate_limited" | "invalid",
  ) {
    super(message);
  }
}

export const currentCustomer = cache(async (): Promise<Customer | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [r] = await sql()`
    SELECT c.id, c.email, c.name, c.phone, to_char(c.date_of_birth, 'YYYY-MM-DD') AS dob
    FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now() AND c.account_created_at IS NOT NULL`;
  return r ? { id: r.id, email: r.email, name: r.name, phone: r.phone, dateOfBirth: r.dob } : null;
});

/** Starts a sign-in: queues a code email. Responds the same whether or not an account exists. */
export async function startLogin(email: string, ipHash: string): Promise<{ loginId: string }> {
  const normalised = normaliseEmail(email);
  return sql().begin(async (tx) => {
    const [{ recent }] = await tx`
      SELECT count(*)::int AS recent FROM customer_login_codes
      WHERE email = ${normalised} AND created_at > now() - interval '1 hour'`;
    if (recent >= 5) throw new AccountError("We've sent several codes to this address. Please check your inbox and spam folder, or try again in an hour.", "rate_limited");
    const [row] = await tx`
      INSERT INTO customer_login_codes (email, expires_at, ip_hash)
      VALUES (${normalised}, now() + make_interval(mins => ${LOGIN_CODE_MINUTES}), ${ipHash})
      RETURNING id, public_id`;
    await enqueue(tx, { kind: "customer_login_code", dedupeKey: `login:${row.id}`, recipient: normalised, payload: { loginId: row.id } });
    return { loginId: row.public_id as string };
  });
}

/**
 * Checks a code. Existing account holders are signed in straight away; anyone
 * else is asked for their details next (prefilled from earlier bookings).
 */
export async function checkLogin(
  loginId: string,
  code: string,
  userAgent: string | null,
): Promise<{ status: "signed_in" } | { status: "needs_profile"; prefill: { name: string; phone: string; dateOfBirth: string } }> {
  const db = sql();
  const result = await db.begin(async (tx) => {
    const [l] = await tx`SELECT * FROM customer_login_codes WHERE public_id = ${loginId} FOR UPDATE`;
    if (!l || l.completed_at) throw new AccountError("This sign-in has finished. Please request a new code.", "expired");
    if (l.expires_at.getTime() <= Date.now()) throw new AccountError("This code has expired. Please request a new one.", "expired");
    if (!l.verified_at) {
      if (!l.code_hash) throw new AccountError("Your code is on its way. If it doesn't arrive in a minute, request a new one.", "invalid");
      if (l.attempts >= MAX_LOGIN_ATTEMPTS) throw new AccountError("Too many incorrect attempts. Please request a new code.", "rate_limited");
      if (!safeEqual(hmac(`login:${l.id}:${code.trim()}`), l.code_hash)) {
        await tx`UPDATE customer_login_codes SET attempts = attempts + 1 WHERE id = ${l.id}`;
        return { ok: false as const };
      }
      await tx`UPDATE customer_login_codes SET verified_at = now() WHERE id = ${l.id}`;
    }
    const [c] = await tx`
      SELECT id, name, phone, to_char(date_of_birth, 'YYYY-MM-DD') AS dob, account_created_at, is_blocked
      FROM customers WHERE email = ${l.email}`;
    if (c?.account_created_at) {
      await tx`UPDATE customer_login_codes SET completed_at = now() WHERE id = ${l.id}`;
      await tx`UPDATE customers SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ${c.id}`;
      return { ok: true as const, customerId: c.id as number };
    }
    return { ok: true as const, prefill: { name: c?.name ?? "", phone: c?.phone ?? "", dateOfBirth: c?.dob ?? "" } };
  });
  if (!result.ok) throw new AccountError("That code isn't right. Please check the latest email and try again.", "invalid_code");
  if (result.customerId !== undefined) {
    await createSession(result.customerId, userAgent);
    return { status: "signed_in" };
  }
  return { status: "needs_profile", prefill: result.prefill! };
}

export type ProfileInput = { name: string; phone: string; dateOfBirth: string };

/** Creates (or upgrades a guest record into) an account after a verified code, then signs in. */
export async function completeProfile(loginId: string, input: ProfileInput, userAgent: string | null) {
  const customerId = await sql().begin(async (tx) => {
    const [l] = await tx`SELECT * FROM customer_login_codes WHERE public_id = ${loginId} FOR UPDATE`;
    if (!l || !l.verified_at || l.completed_at || l.verified_at.getTime() < Date.now() - PROFILE_WINDOW_MINUTES * 60_000) {
      throw new AccountError("This sign-in has expired. Please request a new code.", "expired");
    }
    const [c] = await tx`
      INSERT INTO customers (email, name, phone, phone_normalised, date_of_birth, email_verified_at, account_created_at)
      VALUES (${l.email}, ${input.name}, ${input.phone}, ${normalisePhone(input.phone)}, ${input.dateOfBirth}, now(), now())
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name, phone = EXCLUDED.phone, phone_normalised = EXCLUDED.phone_normalised,
        date_of_birth = EXCLUDED.date_of_birth,
        email_verified_at = COALESCE(customers.email_verified_at, now()),
        account_created_at = COALESCE(customers.account_created_at, now()), updated_at = now()
      RETURNING id`;
    await tx`UPDATE customer_login_codes SET completed_at = now() WHERE id = ${l.id}`;
    return c.id as number;
  });
  await createSession(customerId, userAgent);
}

export async function updateProfile(customerId: number, input: ProfileInput) {
  await sql()`
    UPDATE customers SET name = ${input.name}, phone = ${input.phone}, phone_normalised = ${normalisePhone(input.phone)},
      date_of_birth = ${input.dateOfBirth}, updated_at = now()
    WHERE id = ${customerId}`;
}

async function createSession(customerId: number, userAgent: string | null) {
  const token = newToken();
  await sql()`
    INSERT INTO customer_sessions (token_hash, customer_id, expires_at, user_agent)
    VALUES (${sha256(token)}, ${customerId}, now() + make_interval(days => ${SESSION_DAYS}), ${userAgent?.slice(0, 300) ?? null})`;
  await sql()`DELETE FROM customer_sessions WHERE expires_at < now()`;
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await sql()`DELETE FROM customer_sessions WHERE token_hash = ${sha256(token)}`;
  jar.delete(CUSTOMER_COOKIE);
}

export type AccountBooking = {
  id: number;
  reference: string;
  status: string;
  startsAt: string;
  totalPence: number;
  items: { kind: string; name: string; refId: number | null }[];
};

/** The signed-in customer's bookings, newest first (matched by customer record). */
export async function accountBookings(customerId: number): Promise<AccountBooking[]> {
  const rows = await sql()`
    SELECT b.id, b.reference, b.status, b.starts_at, b.total_pence,
      COALESCE(json_agg(json_build_object('kind', i.kind, 'name', i.name, 'refId', COALESCE(i.treatment_id, i.extra_id)) ORDER BY i.sort_order)
        FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM bookings b LEFT JOIN booking_items i ON i.booking_id = b.id
    WHERE b.customer_id = ${customerId}
    GROUP BY b.id ORDER BY b.starts_at DESC LIMIT 50`;
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    startsAt: r.starts_at.toISOString(),
    totalPence: r.total_pence,
    items: r.items,
  }));
}

