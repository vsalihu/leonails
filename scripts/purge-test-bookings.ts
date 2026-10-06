/**
 * Deletes test bookings (and their customers if they have no other bookings)
 * whose email ends with the given domain. Dry run unless --confirm is passed.
 *   npm run bookings:purge-test -- --domain example.test
 *   npm run bookings:purge-test -- --domain example.test --confirm
 * Genuine records are untouched: only exact domain matches are affected.
 */
import "dotenv/config";
import postgres from "postgres";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const domain = arg("domain")?.toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    console.error("Usage: npm run bookings:purge-test -- --domain example.test [--confirm]");
    process.exit(1);
  }
  const confirm = process.argv.includes("--confirm");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const pattern = `%@${domain}`;
  const rows = await sql`SELECT id, reference, customer_email, status, starts_at FROM bookings WHERE customer_email ILIKE ${pattern} ORDER BY starts_at`;
  console.log(`${rows.length} booking(s) with emails ending @${domain}:`);
  for (const r of rows) console.log(`  ${r.reference}  ${r.status.padEnd(9)}  ${r.starts_at.toISOString()}  ${r.customer_email}`);
  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to delete them.");
  } else if (rows.length) {
    await sql.begin(async (tx) => {
      const ids = rows.map((r) => r.id);
      await tx`UPDATE slot_holds SET converted_booking_id = NULL WHERE converted_booking_id IN ${tx(ids)}`;
      await tx`DELETE FROM bookings WHERE id IN ${tx(ids)}`;
      await tx`DELETE FROM customers c WHERE c.email ILIKE ${pattern} AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id)`;
      await tx`INSERT INTO audit_events (actor_type, action, entity_type, details) VALUES ('system', 'bookings.test_purged', 'booking', ${tx.json({ domain, count: ids.length })})`;
    });
    console.log(`\nDeleted ${rows.length} booking(s).`);
  }
  await sql.end();
})();
