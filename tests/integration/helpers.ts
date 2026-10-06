import postgres from "postgres";
import { DateTime } from "luxon";
import { migrate } from "../../scripts/migrate";
import { sql } from "@/lib/server/db";

const TZ = "Europe/London";

/** Fresh schema + deterministic fixtures. Open every day 09:00-17:00 with lunch 12:30-13:15. */
export async function resetDb() {
  const url = process.env.DATABASE_URL!;
  if (!url.includes("_test")) throw new Error("Refusing to reset a non-test database");
  // Recycle the app pool: prepared statements are tied to the old schema.
  const g = globalThis as unknown as { __sql?: { end: () => Promise<void> } };
  if (g.__sql) {
    await g.__sql.end();
    g.__sql = undefined;
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`);
  await admin.end();
  await migrate(url, () => {});
  const db = sql();
  await db`INSERT INTO business_settings (id, business_name, public_location, notification_email, min_notice_minutes) VALUES (1, 'Test Atelier', 'Wisbech', 'owner@example.test', 60)`;
  await db`INSERT INTO private_location (id, address_lines, postcode, arrival_instructions) VALUES (1, '1 Secret Lane', 'PE13 0XX', 'Ring the bell')`;
  await db`INSERT INTO policies (kind, version, body) VALUES ('cancellation', 1, 'c'), ('booking_terms', 1, 't'), ('privacy', 1, 'p')`;
  const [t] = await db`INSERT INTO technicians (name, is_default) VALUES ('Rugile', true) RETURNING id`;
  for (let d = 1; d <= 7; d++) {
    await db`INSERT INTO working_hours (technician_id, weekday, start_time, end_time) VALUES (${t.id}, ${d}, '09:00', '12:30'), (${t.id}, ${d}, '13:15', '17:00')`;
  }
  const [gel] = await db`INSERT INTO treatments (slug, name, price_pence, duration_minutes) VALUES ('gel', 'Gel manicure', 3000, 60) RETURNING id`;
  const [builder] = await db`INSERT INTO treatments (slug, name, price_pence, duration_minutes) VALUES ('builder', 'Builder gel overlay', 3800, 75) RETURNING id`;
  const [french] = await db`INSERT INTO extras (slug, name, price_pence, duration_minutes) VALUES ('french', 'French finish', 500, 15) RETURNING id`;
  const [art] = await db`INSERT INTO extras (slug, name, price_pence, duration_minutes) VALUES ('art', 'Nail art', 500, 15) RETURNING id`;
  await db`INSERT INTO treatment_extras VALUES (${gel.id}, ${french.id}), (${gel.id}, ${art.id}), (${builder.id}, ${french.id})`;
  return { technicianId: t.id as number, gel: gel.id as number, builder: builder.id as number, french: french.id as number, art: art.id as number };
}

/** An absolute instant for a local wall-clock time `days` from today. */
export function at(days: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return DateTime.now().setZone(TZ).plus({ days }).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();
}

export function localDate(days: number): string {
  return DateTime.now().setZone(TZ).plus({ days }).toISODate()!;
}

export async function codeFor(holdId: number): Promise<string> {
  // The worker mints codes at send time; in tests we mint deterministically by
  // brute-forcing the stored HMAC is impossible, so set a known code instead.
  const { hmac } = await import("@/lib/server/crypto");
  const code = "123456";
  await sql()`UPDATE slot_holds SET verification_code_hash = ${hmac(`verify:${holdId}:${code}`)} WHERE id = ${holdId}`;
  return code;
}
