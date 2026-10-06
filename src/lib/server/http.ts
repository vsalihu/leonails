import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { BookingError } from "./holds";
import { SelectionError } from "./catalogue";
import { env } from "./env";

export const SESSION_COOKIE = "bk_session";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

/** Rejects cross-site POSTs to JSON endpoints (defence in depth beyond SameSite cookies). */
export async function assertSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") === "same-origin" || h.get("sec-fetch-site") === null;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(env().APP_URL).origin;
  } catch {
    return false;
  }
}

/** Opaque per-browser checkout session id (httpOnly cookie). */
export async function checkoutSession(create = true): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{32}$/.test(existing)) return existing;
  if (!create) return null;
  const id = randomBytes(24).toString("base64url");
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return id;
}

export async function parseJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T> | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("Invalid request.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorJson(parsed.error.issues[0]?.message ?? "Invalid request.", 422, {
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])),
    });
  }
  return parsed.data;
}

const STATUS: Record<BookingError["code"], number> = {
  slot_taken: 409,
  hold_expired: 410,
  invalid: 422,
  rate_limited: 429,
  not_verified: 403,
  price_changed: 409,
  blocked: 403,
  closed: 503,
  not_found: 404,
  cutoff: 403,
};

export function handleError(err: unknown) {
  if (err instanceof BookingError) {
    return errorJson(err.message, STATUS[err.code], { code: err.code, ...(err.data && typeof err.data === "object" ? err.data : {}) });
  }
  if (err instanceof SelectionError) return errorJson(err.message, 422, { code: "invalid" });
  console.error("[api] unexpected error", err);
  return errorJson("Something went wrong on our side. Your booking has not been changed. Please try again.", 500, { code: "server_error" });
}
