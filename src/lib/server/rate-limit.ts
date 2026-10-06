import "server-only";
import { headers } from "next/headers";
import { sql } from "./db";
import { env } from "./env";
import { hmacHex } from "./crypto";

/**
 * Fixed-window counter stored in Postgres so limits hold across instances.
 * Returns true when the request is allowed.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = sql();
  const [row] = await db<{ count: number }[]>`
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (${bucket}, to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`;
  // Opportunistic cleanup of old windows.
  if (Math.random() < 0.02) {
    await db`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`;
  }
  return row.count <= limit;
}

/** Client IP, honouring X-Forwarded-For only for the configured number of trusted proxies. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const hops = env().TRUSTED_PROXY_COUNT;
  if (hops > 0) {
    const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops];
  }
  return h.get("x-real-ip") ?? "unknown";
}

/** IPs are only stored/compared as keyed hashes. */
export async function clientIpHash(): Promise<string> {
  return hmacHex(`ip:${await clientIp()}`).slice(0, 32);
}

/** Current count in the window without incrementing (for failure-only limits). */
export async function rateCount(bucket: string, windowSeconds: number): Promise<number> {
  const [row] = await sql()<{ count: number }[]>`
    SELECT count FROM rate_limits
    WHERE bucket = ${bucket} AND window_start = to_timestamp(floor(extract(epoch FROM now()) / ${windowSeconds}) * ${windowSeconds})`;
  return row?.count ?? 0;
}
