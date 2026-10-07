/* Applies SQL migrations in db/migrations in filename order, once each. */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export async function migrate(databaseUrl: string, log = console.log) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const dir = path.join(process.cwd(), "db", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "\nDATABASE_URL is not set for this service, so the app can't reach its database.\n" +
        "On Railway: open the app service (not the Postgres one) > Variables > New Variable >\n" +
        "Add Reference > choose your PostgreSQL service > DATABASE_URL, then deploy the change.\n" +
        "Or add it by hand as DATABASE_URL=${{Postgres.DATABASE_URL}}, where 'Postgres' is the\n" +
        "database service's exact name on the project canvas.\n",
    );
    process.exit(1);
  }
  migrate(url).then(() => console.log("migrations up to date"), (e) => { console.error(e); process.exit(1); });
}
