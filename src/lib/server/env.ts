import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  // 32+ random bytes, used to derive HMACs for codes and hashed IPs.
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),

  // Email: "smtp" delivers through a real provider; "devmailbox" captures messages
  // in the database for testing and never claims external delivery.
  MAIL_DRIVER: z.enum(["smtp", "devmailbox"]).default("devmailbox"),
  MAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // Storage: "local" writes to STORAGE_DIR; "s3" uses any S3-compatible bucket.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Background jobs: run the outbox worker inside the web server process.
  WORKER_IN_PROCESS: bool,
  // Shared secret for POST /api/cron/run-jobs (external scheduler option).
  CRON_SECRET: z.string().optional(),
  // Number of reverse proxies in front of the app, for client IP extraction.
  TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function mailConfigured(): boolean {
  const e = env();
  return e.MAIL_DRIVER === "smtp" && !!e.SMTP_HOST && !!e.MAIL_FROM;
}

/** Test hook: re-read process.env on next access. */
export function resetEnvCacheForTests() {
  cached = undefined;
}
