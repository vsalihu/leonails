import "server-only";
import { sql, type Db } from "./db";

export type Settings = {
  businessName: string;
  publicLocation: string;
  contactEmail: string | null;
  notificationEmail: string | null;
  contactPhone: string | null;
  instagramHandle: string | null;
  timezone: string;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  holdMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  customerChangeCutoffMinutes: number;
  reminderLeadMinutes: number;
  remindersEnabled: boolean;
  bookingsEnabled: boolean;
  isExample: boolean;
};

export async function getSettings(db: Db = sql()): Promise<Settings> {
  const [r] = await db`SELECT * FROM business_settings WHERE id = 1`;
  if (!r) throw new Error("Business settings are missing. Run `npm run db:seed`.");
  return {
    businessName: r.business_name,
    publicLocation: r.public_location,
    contactEmail: r.contact_email,
    notificationEmail: r.notification_email,
    contactPhone: r.contact_phone,
    instagramHandle: r.instagram_handle,
    timezone: r.timezone,
    slotIntervalMinutes: r.slot_interval_minutes,
    bufferMinutes: r.buffer_minutes,
    holdMinutes: r.hold_minutes,
    minNoticeMinutes: r.min_notice_minutes,
    horizonDays: r.horizon_days,
    customerChangeCutoffMinutes: r.customer_change_cutoff_minutes,
    reminderLeadMinutes: r.reminder_lead_minutes,
    remindersEnabled: r.reminders_enabled,
    bookingsEnabled: r.bookings_enabled,
    isExample: r.is_example,
  };
}

export type ContentBlock = { key: string; title: string | null; body: string; isExample: boolean };

export async function getContent(keys: string[], db: Db = sql()): Promise<Record<string, ContentBlock>> {
  const rows = await db`SELECT key, title, body, is_example FROM content_blocks WHERE key IN ${db(keys)}`;
  const out: Record<string, ContentBlock> = {};
  for (const r of rows) out[r.key] = { key: r.key, title: r.title, body: r.body, isExample: r.is_example };
  for (const k of keys) out[k] ??= { key: k, title: null, body: "", isExample: false };
  return out;
}

export type PolicyKind = "cancellation" | "privacy" | "booking_terms";

export async function getLatestPolicy(kind: PolicyKind, db: Db = sql()) {
  const [r] = await db`SELECT version, body, is_example, created_at FROM policies WHERE kind = ${kind} ORDER BY version DESC LIMIT 1`;
  return r ? { version: r.version as number, body: r.body as string, isExample: r.is_example as boolean, updatedAt: r.created_at as Date } : null;
}

export async function currentPolicyVersions(db: Db = sql()): Promise<Record<string, number>> {
  const rows = await db`SELECT kind, max(version)::int AS version FROM policies GROUP BY kind`;
  return Object.fromEntries(rows.map((r) => [r.kind, r.version]));
}
