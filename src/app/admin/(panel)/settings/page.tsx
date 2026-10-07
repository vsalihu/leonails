import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { getPrivateLocation } from "@/lib/server/private-location";
import { requireAdmin, MIN_PASSWORD } from "@/lib/server/auth";
import { mailMode } from "@/lib/server/notifications/mailer";
import { env } from "@/lib/server/env";
import { PageHeader, Panel, ExampleFlag } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { addressAction, businessAction, copyAction, hoursAction, passwordAction, policyAction, ribbonAction, rulesAction } from "./actions";
import { RIBBON_ROWS } from "@/lib/ribbon";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { id: "business", label: "Business" },
  { id: "booking", label: "Booking rules" },
  { id: "hours", label: "Working hours" },
  { id: "address", label: "Private address" },
  { id: "copy", label: "Website copy" },
  { id: "ribbon", label: "Ribbon" },
  { id: "policies", label: "Policies" },
  { id: "account", label: "Account" },
  { id: "system", label: "System" },
  { id: "audit", label: "Activity log" },
];
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const COPY: { key: string; label: string; hasTitle: boolean }[] = [
  { key: "home.hero", label: "Homepage headline and subtext", hasTitle: true },
  { key: "home.intro", label: "Homepage introduction", hasTitle: true },
  { key: "home.visit", label: "Homepage visit section", hasTitle: false },
  { key: "about.body", label: "About page", hasTitle: true },
  { key: "about.studio", label: "About page: the studio", hasTitle: true },
  { key: "treatments.intro", label: "Treatments page introduction", hasTitle: true },
  { key: "treatments.removal", label: "Treatments page: removal", hasTitle: true },
];
const POLICY: { kind: string; label: string }[] = [
  { kind: "cancellation", label: "Cancellation policy" },
  { kind: "booking_terms", label: "Booking terms" },
  { kind: "privacy", label: "Privacy notice" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: t } = await searchParams;
  const tab = TABS.some((x) => x.id === t) ? t! : "business";
  const admin = await requireAdmin();
  const s = await getSettings();
  const db = sql();

  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
        <ul className="flex gap-1">
          {TABS.map((x) => (
            <li key={x.id}><Link href={`?tab=${x.id}`} aria-current={tab === x.id ? "page" : undefined} className={`flex min-h-11 items-center whitespace-nowrap px-3 text-sm ${tab === x.id ? "border-b-2 border-ink font-medium" : "text-taupe"}`}>{x.label}</Link></li>
          ))}
        </ul>
      </nav>

      {tab === "business" && (
        <Panel title="Business details" actions={<ExampleFlag show={s.isExample} />}>
          <ActionForm action={businessAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
            <AField name="businessName" label="Business name"><input name="businessName" defaultValue={s.businessName} className="input" /></AField>
            <AField name="publicLocation" label="Public location" help="Town only. The full address is never shown publicly."><input name="publicLocation" defaultValue={s.publicLocation} className="input" /></AField>
            <AField name="contactEmail" label="Public contact email (optional)"><input name="contactEmail" type="email" defaultValue={s.contactEmail ?? ""} className="input" /></AField>
            <AField name="notificationEmail" label="Send booking and enquiry alerts to" help="Your own inbox. Leave blank for no alerts."><input name="notificationEmail" type="email" defaultValue={s.notificationEmail ?? ""} className="input" /></AField>
            <AField name="contactPhone" label="Public phone (optional)"><input name="contactPhone" defaultValue={s.contactPhone ?? ""} className="input" /></AField>
            <AField name="instagramHandle" label="Instagram handle (optional)"><input name="instagramHandle" defaultValue={s.instagramHandle ?? ""} className="input" /></AField>
          </ActionForm>
        </Panel>
      )}

      {tab === "ribbon" && (await ribbonPanel())}

      {tab === "booking" && (
        <Panel title="Booking rules">
          <ActionForm action={rulesAction} className="grid max-w-3xl gap-4 md:grid-cols-2">
            <AField name="slotInterval" label="Start times every (minutes)"><select name="slotInterval" defaultValue={s.slotIntervalMinutes} className="input">{[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></AField>
            <AField name="buffer" label="Buffer after each appointment (minutes)"><input name="buffer" type="number" min={0} max={120} step={5} defaultValue={s.bufferMinutes} className="input" /></AField>
            <AField name="minNoticeHours" label="Minimum notice (hours)"><input name="minNoticeHours" type="number" min={0} step={0.5} defaultValue={s.minNoticeMinutes / 60} className="input" /></AField>
            <AField name="horizonDays" label="Bookable up to (days ahead)"><input name="horizonDays" type="number" min={1} max={365} defaultValue={s.horizonDays} className="input" /></AField>
            <AField name="cutoffHours" label="Customers can change or cancel online until (hours before)"><input name="cutoffHours" type="number" min={0} step={0.5} defaultValue={s.customerChangeCutoffMinutes / 60} className="input" /></AField>
            <AField name="hold" label="Time held during checkout (minutes)"><input name="hold" type="number" min={2} max={30} defaultValue={s.holdMinutes} className="input" /></AField>
            <AField name="reminderHours" label="Reminder email (hours before)"><input name="reminderHours" type="number" min={1} max={168} defaultValue={s.reminderLeadMinutes / 60} className="input" /></AField>
            <div className="grid content-end gap-2 pb-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="reminders" defaultChecked={s.remindersEnabled} className="accent-[var(--color-ink)]" /> Send reminder emails</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="bookingsEnabled" defaultChecked={s.bookingsEnabled} className="accent-[var(--color-ink)]" /> Online booking open</label>
            </div>
            <p className="text-xs text-taupe md:col-span-2">Timezone: {s.timezone}. Currency: GBP. Payment is taken at the appointment.</p>
          </ActionForm>
        </Panel>
      )}

      {tab === "hours" && <Hours />}

      {tab === "address" && <Address />}

      {tab === "copy" && <Copy />}

      {tab === "policies" && <Policies />}

      {tab === "account" && (
        <Panel title={`Signed in as ${admin.email}`}>
          <ActionForm action={passwordAction} submitLabel="Change password" resetOnSuccess className="grid max-w-md gap-4">
            <AField name="current" label="Current password"><input name="current" type="password" autoComplete="current-password" className="input" /></AField>
            <AField name="next" label="New password" help={`At least ${MIN_PASSWORD} characters.`}><input name="next" type="password" autoComplete="new-password" className="input" /></AField>
            <AField name="confirm" label="Repeat new password"><input name="confirm" type="password" autoComplete="new-password" className="input" /></AField>
          </ActionForm>
        </Panel>
      )}

      {tab === "system" && <System />}

      {tab === "audit" && <Audit />}
    </>
  );

  async function Hours() {
    const rows = await db`SELECT weekday, start_time::text AS s, end_time::text AS e, is_example FROM working_hours wh JOIN technicians t ON t.id = wh.technician_id AND t.is_default ORDER BY weekday, start_time`;
    return (
      <Panel title="Weekly working hours" actions={<ExampleFlag show={rows.some((r) => r.is_example)} />}>
        <p className="mb-4 max-w-2xl text-sm text-taupe">Add a second period for a lunch break. Holidays and one-off changes are set in the <Link className="underline" href="/admin/calendar#block">calendar</Link>. Existing bookings are never moved; any that fall outside new hours are flagged.</p>
        <ActionForm action={hoursAction} submitLabel="Save hours" className="grid gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const day = rows.filter((r) => r.weekday === d);
            return (
              <fieldset key={d} className="grid items-center gap-3 border-b border-line pb-3 sm:grid-cols-[9rem_1fr_1fr]">
                <legend className="sr-only">{DAYS[d]}</legend>
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" name={`open-${d}`} defaultChecked={day.length > 0} className="accent-[var(--color-ink)]" /> {DAYS[d]}</label>
                {[1, 2].map((k) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <label className="sr-only" htmlFor={`d${d}s${k}`}>{DAYS[d]} period {k} start</label>
                    <input id={`d${d}s${k}`} name={`d${d}s${k}`} type="time" step={300} defaultValue={day[k - 1]?.s.slice(0, 5) ?? ""} className="input min-h-11" />
                    <span aria-hidden>to</span>
                    <label className="sr-only" htmlFor={`d${d}e${k}`}>{DAYS[d]} period {k} end</label>
                    <input id={`d${d}e${k}`} name={`d${d}e${k}`} type="time" step={300} defaultValue={day[k - 1]?.e.slice(0, 5) ?? ""} className="input min-h-11" />
                  </div>
                ))}
              </fieldset>
            );
          })}
        </ActionForm>
      </Panel>
    );
  }

  async function Address() {
    const loc = await getPrivateLocation();
    return (
      <Panel title="Private appointment address" actions={<ExampleFlag show={!!loc?.isExample} />}>
        <p className="mb-4 max-w-2xl text-sm text-taupe">Only shown to customers with a confirmed booking: on their private appointment page and in confirmation and reminder emails. Never on the public website, maps or calendar files.</p>
        <ActionForm action={addressAction} className="grid max-w-xl gap-4">
          <AField name="addressLines" label="Address"><textarea name="addressLines" rows={3} defaultValue={loc?.addressLines ?? ""} className="input" /></AField>
          <AField name="postcode" label="Postcode"><input name="postcode" defaultValue={loc?.postcode ?? ""} className="input" /></AField>
          <AField name="arrival" label="Arrival instructions" help="Parking, which door, what to bring."><textarea name="arrival" rows={2} defaultValue={loc?.arrivalInstructions ?? ""} className="input" /></AField>
        </ActionForm>
      </Panel>
    );
  }

  async function Copy() {
    const blocks = await db`SELECT * FROM content_blocks`;
    return (
      <div className="space-y-4">
        {COPY.map((c) => {
          const b = blocks.find((x) => x.key === c.key);
          return (
            <Panel key={c.key} title={c.label} actions={<ExampleFlag show={!!b?.is_example} />}>
              <ActionForm action={copyAction} className="grid max-w-3xl gap-4">
                <input type="hidden" name="key" value={c.key} />
                {c.hasTitle && <AField name="title" label="Heading"><input name="title" defaultValue={b?.title ?? ""} className="input" /></AField>}
                <AField name="body" label="Text" help="Leave a blank line between paragraphs."><textarea name="body" rows={4} defaultValue={b?.body ?? ""} className="input" /></AField>
              </ActionForm>
            </Panel>
          );
        })}
      </div>
    );
  }

  async function Policies() {
    const rows = await db`SELECT DISTINCT ON (kind) kind, version, body, is_example, created_at FROM policies ORDER BY kind, version DESC`;
    return (
      <div className="space-y-4">
        <p className="max-w-2xl text-sm text-taupe">Saving publishes a new version. Each booking records the versions the customer agreed to.</p>
        {POLICY.map((p) => {
          const r = rows.find((x) => x.kind === p.kind);
          return (
            <Panel key={p.kind} title={`${p.label}${r ? ` (version ${r.version})` : ""}`} actions={<ExampleFlag show={!!r?.is_example} />}>
              <ActionForm action={policyAction} submitLabel="Publish new version" className="grid gap-4">
                <input type="hidden" name="kind" value={p.kind} />
                <AField name="body" label="Policy text"><textarea name="body" rows={8} defaultValue={r?.body ?? ""} className="input" /></AField>
              </ActionForm>
            </Panel>
          );
        })}
      </div>
    );
  }

  async function System() {
    const e = env();
    const mode = mailMode();
    const [counts] = await db`SELECT (SELECT count(*)::int FROM notification_jobs WHERE status = 'pending' AND run_at <= now() - interval '5 minutes') AS stuck`;
    const row = (label: string, ok: boolean, text: string) => (
      <li className="flex flex-wrap justify-between gap-2 py-2"><span>{label}</span><span className={ok ? "text-success" : "text-error"}>{text}</span></li>
    );
    return (
      <Panel title="Integrations and status">
        <ul className="divide-y divide-line text-sm">
          {row("Email delivery", mode === "smtp", mode === "smtp" ? "SMTP configured" : mode === "devmailbox" ? "Development mailbox only (not sending)" : "SMTP selected but missing settings")}
          {row("Image storage", true, e.STORAGE_DRIVER === "s3" ? `S3 bucket ${e.S3_BUCKET}` : "Local disk (needs a persistent volume in production)")}
          {row("Background jobs", counts.stuck === 0, e.WORKER_IN_PROCESS ? "Running inside the web server" : "External worker or cron endpoint")}
          {counts.stuck > 0 && row("Overdue emails", false, `${counts.stuck} waiting more than 5 minutes; check the worker is running`)}
          {row("Public site address", true, e.APP_URL)}
        </ul>
        <p className="mt-4 text-xs text-taupe">These are set in the server environment (see the deployment guide), not here, so secrets never pass through the browser.</p>
      </Panel>
    );
  }

  async function Audit() {
    const rows = await db`SELECT e.*, a.name AS admin_name FROM audit_events e LEFT JOIN admin_users a ON a.id = e.actor_id AND e.actor_type = 'admin' ORDER BY e.id DESC LIMIT 200`;
    return (
      <Panel title="Recent activity">
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 py-2 md:grid-cols-[10rem_1fr_auto]">
              <span className="text-taupe tabular-nums">{DateTime.fromJSDate(r.created_at, { zone: s.timezone }).toFormat("d LLL, HH:mm")}</span>
              <span>
                {r.action.replace(/[._]/g, " ")}
                {r.entity_type === "booking" && r.entity_id ? <> · <Link className="underline" href={`/admin/bookings/${r.entity_id}`}>booking</Link></> : null}
                {r.reason && <span className="text-taupe"> · {r.reason}</span>}
              </span>
              <span className="text-taupe">{r.actor_type === "admin" ? r.admin_name ?? "admin" : r.actor_type}</span>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
}

async function ribbonPanel() {
  const [r] = await sql()`SELECT is_enabled, messages FROM announcement_ribbon WHERE id = 1`;
  const messages = ((r?.messages ?? []) as { text: string; code: string | null; href: string | null }[]).slice(0, RIBBON_ROWS);
  const rows = Array.from({ length: RIBBON_ROWS }, (_, i) => messages[i] ?? { text: "", code: null, href: null });
  return (
    <Panel title="Announcement ribbon">
      <p className="mb-5 max-w-2xl text-sm text-taupe">
        A slim ribbon above the menu on every page of the website. With more than one message they take turns, every few seconds.
        Add an offer code and visitors can copy it with one tap. Leave a row empty to skip it.
      </p>
      <ActionForm action={ribbonAction} className="grid max-w-4xl gap-6">
        <label className="flex items-center gap-3 text-[0.95rem]">
          <input type="checkbox" name="enabled" defaultChecked={!!r?.is_enabled} className="h-5 w-5 accent-[var(--color-ink)]" />
          Show the ribbon on the website
        </label>
        {rows.map((m, i) => (
          <fieldset key={i} className="grid gap-3 border-t border-line pt-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]">
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-taupe">Message {i + 1}</legend>
            <AField name={`text${i}`} label="Message" help={i === 0 ? "e.g. Autumn appointments are open" : undefined}>
              <input name={`text${i}`} defaultValue={m.text} maxLength={110} className="input" />
            </AField>
            <AField name={`code${i}`} label="Offer code (optional)" help={i === 0 ? "e.g. WELCOME20" : undefined}>
              <input name={`code${i}`} defaultValue={m.code ?? ""} maxLength={24} className="input uppercase" autoCapitalize="characters" />
            </AField>
            <AField name={`href${i}`} label="Link (optional)" help={i === 0 ? "e.g. /book or /treatments" : undefined}>
              <input name={`href${i}`} defaultValue={m.href ?? ""} className="input" placeholder="/book" />
            </AField>
          </fieldset>
        ))}
      </ActionForm>
    </Panel>
  );
}
