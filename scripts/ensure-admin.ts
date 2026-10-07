/**
 * Hosting helper: creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if
 * that account doesn't exist yet. Never changes an existing account, so a
 * password changed in the dashboard survives redeploys. No-op when unset.
 */
import "dotenv/config";
import postgres from "postgres";
import { hashPassword } from "../src/lib/server/crypto";

(async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("[admin] ADMIN_EMAIL/ADMIN_PASSWORD not set; skipping");
    return;
  }
  if (password.length < 12) {
    console.error("[admin] ADMIN_PASSWORD must be at least 12 characters; skipping");
    return;
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const [r] = await sql`
    INSERT INTO admin_users (email, name, password_hash)
    VALUES (${email}, ${process.env.ADMIN_NAME ?? "Rugile"}, ${await hashPassword(password)})
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  await sql.end();
  console.log(r ? `[admin] created ${email}` : `[admin] ${email} already exists; unchanged`);
})();
