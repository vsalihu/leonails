import postgres from "postgres";
import "dotenv/config";

/**
 * Repeated local runs trip the site's own rate limits (sign-in codes, bookings
 * per address per hour). Tests run against a development or staging database,
 * so start each run with a clean slate.
 */
export default async function globalSetup() {
  const db = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await db`DELETE FROM rate_limits`;
  } finally {
    await db.end();
  }
}
