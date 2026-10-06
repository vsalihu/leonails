/**
 * Creates (or resets the password of) an admin user.
 *   npm run admin:create -- --email rugile@example.com --name "Rugile"
 * The password is read from ADMIN_PASSWORD, or generated and printed once.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "../src/lib/server/crypto";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

(async () => {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name") ?? "Rugile";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run admin:create -- --email you@example.com [--name "Rugile"]');
    process.exit(1);
  }
  const provided = process.env.ADMIN_PASSWORD;
  if (provided && provided.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }
  const password = provided ?? randomBytes(15).toString("base64url");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const hash = await hashPassword(password);
  const [r] = await sql`
    INSERT INTO admin_users (email, name, password_hash) VALUES (${email}, ${name}, ${hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true
    RETURNING id, (xmax = 0) AS created`;
  await sql`DELETE FROM admin_sessions WHERE admin_id = ${r.id}`;
  await sql.end();
  console.log(`${r.created ? "Created" : "Updated"} admin ${email}`);
  if (!provided) console.log(`Temporary password (shown once): ${password}\nChange it in Admin > Settings > Account after signing in.`);
})();
