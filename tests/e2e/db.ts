import "dotenv/config";
import postgres from "postgres";

// Short idle timeout so connections close on their own when a spec file finishes.
export const db = postgres(process.env.DATABASE_URL!, { max: 2, idle_timeout: 1, onnotice: () => {} });

export async function latestCodeFor(email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [m] = await db`SELECT subject FROM dev_mailbox WHERE recipient = ${email} AND subject LIKE '%is your%' ORDER BY id DESC LIMIT 1`;
    if (m) return /(\d{6})/.exec(m.subject)![1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email captured for ${email}`);
}
