import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { env } from "./env";
import { hashPassword, newToken, sha256, verifyPassword } from "./crypto";
import { rateLimit, rateCount, clientIpHash } from "./rate-limit";
import { enqueue } from "./notifications/outbox";
import { kickWorker } from "./notifications/worker";
import { audit } from "./audit";

export const ADMIN_COOKIE = "admin_session";
const SESSION_DAYS = 14;

export type Admin = { id: number; email: string; name: string };

export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const [r] = await sql()`
    SELECT a.id, a.email, a.name FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now() AND a.is_active`;
  return r ? { id: r.id, email: r.email, name: r.name } : null;
});

/** Every admin page and action calls this. Authorisation is enforced on the server, per request. */
export async function requireAdmin(): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export const MIN_PASSWORD = 12;

let dummyHash: Promise<string> | undefined;

export async function login(email: string, password: string, userAgent: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await clientIpHash();
  const normalised = email.trim().toLowerCase();
  // Only failed attempts count towards the limit.
  if ((await rateCount(`login-fail:${ip}`, 900)) >= 10 || (await rateCount(`login-fail-email:${normalised}`, 900)) >= 10) {
    return { ok: false, error: "Too many attempts. Please wait 15 minutes and try again." };
  }
  const [a] = await sql()`SELECT id, password_hash, is_active FROM admin_users WHERE email = ${normalised}`;
  // Verify against a dummy hash when the user doesn't exist to keep timing similar.
  dummyHash ??= hashPassword(newToken());
  const ok = await verifyPassword(password, a?.password_hash ?? (await dummyHash));
  if (!a || !a.is_active || !ok) {
    await rateLimit(`login-fail:${ip}`, 10, 900);
    await rateLimit(`login-fail-email:${normalised}`, 10, 900);
    return { ok: false, error: "That email and password don't match." };
  }
  const token = newToken();
  await sql()`
    INSERT INTO admin_sessions (token_hash, admin_id, expires_at, user_agent)
    VALUES (${sha256(token)}, ${a.id}, now() + make_interval(days => ${SESSION_DAYS}), ${userAgent?.slice(0, 300) ?? null})`;
  await sql()`UPDATE admin_users SET last_login_at = now() WHERE id = ${a.id}`;
  await sql()`DELETE FROM admin_sessions WHERE expires_at < now()`;
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (token) await sql()`DELETE FROM admin_sessions WHERE token_hash = ${sha256(token)}`;
  jar.delete(ADMIN_COOKIE);
}

/** Always responds the same way whether or not the email exists. */
export async function requestPasswordReset(email: string) {
  const ip = await clientIpHash();
  if (!(await rateLimit(`reset:${ip}`, 5, 3600))) return;
  const [a] = await sql()`SELECT id, email FROM admin_users WHERE email = ${email.trim().toLowerCase()} AND is_active`;
  if (!a) return;
  await enqueue(sql(), {
    kind: "admin_password_reset",
    dedupeKey: `reset:${a.id}:${Date.now()}`,
    recipient: a.email,
    payload: { adminId: a.id },
  });
  kickWorker();
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  return sql().begin(async (tx) => {
    const [r] = await tx`
      SELECT admin_id FROM admin_password_resets
      WHERE token_hash = ${sha256(token)} AND used_at IS NULL AND expires_at > now() FOR UPDATE`;
    if (!r) return { ok: false as const, error: "This reset link is invalid, used or expired. Please request a new one." };
    await tx`UPDATE admin_password_resets SET used_at = now() WHERE token_hash = ${sha256(token)}`;
    await tx`UPDATE admin_users SET password_hash = ${await hashPassword(password)} WHERE id = ${r.admin_id}`;
    // sign out everywhere
    await tx`DELETE FROM admin_sessions WHERE admin_id = ${r.admin_id}`;
    await audit(tx, { type: "admin", id: r.admin_id }, "admin.password_reset", "admin_user", r.admin_id);
    return { ok: true as const };
  });
}

export async function changePassword(adminId: number, current: string, next: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (next.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  const [a] = await sql()`SELECT password_hash FROM admin_users WHERE id = ${adminId}`;
  if (!a || !(await verifyPassword(current, a.password_hash))) return { ok: false, error: "Your current password isn't right." };
  await sql()`UPDATE admin_users SET password_hash = ${await hashPassword(next)} WHERE id = ${adminId}`;
  await audit(sql(), { type: "admin", id: adminId }, "admin.password_changed", "admin_user", adminId);
  return { ok: true };
}
