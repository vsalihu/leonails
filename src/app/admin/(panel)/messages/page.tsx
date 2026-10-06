import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { mailMode } from "@/lib/server/notifications/mailer";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/action-form";
import { enquiryStatusAction, retryJobAction } from "./actions";

export const metadata: Metadata = { title: "Messages" };

const TABS = [
  { id: "enquiries", label: "Enquiries" },
  { id: "emails", label: "Email delivery" },
  { id: "mailbox", label: "Development mailbox" },
];

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string; mail?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "enquiries";
  const s = await getSettings();
  const db = sql();
  const z = (d: Date) => DateTime.fromJSDate(d, { zone: s.timezone }).toFormat("d LLL yyyy, HH:mm");
  const mode = mailMode();

  return (
    <>
      <PageHeader title="Messages" />
      <nav aria-label="Message views" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.id} href={`?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} className={`min-h-11 px-4 py-3 text-sm ${tab === t.id ? "border-b-2 border-ink font-medium" : "text-taupe"}`}>{t.label}</Link>
        ))}
      </nav>

      {tab === "enquiries" && <Enquiries />}

      {tab === "emails" && (
        <>
          <p className="mb-4 text-sm">
            Delivery mode: <strong className="font-medium">{mode === "smtp" ? "SMTP (real email)" : mode === "devmailbox" ? "Development mailbox (not sent)" : "SMTP selected but not configured"}</strong>.
            {mode !== "smtp" && " Configure SMTP in the server environment to deliver email to customers."}
          </p>
          <Jobs />
        </>
      )}

      {tab === "mailbox" && <Mailbox selected={Number(sp.mail) || null} />}
    </>
  );

  async function Enquiries() {
    const rows = await db`SELECT * FROM enquiries ORDER BY (status = 'new') DESC, created_at DESC LIMIT 100`;
    if (!rows.length) return <Empty>No enquiries yet.</Empty>;
    return (
      <ul className="space-y-4">
        {rows.map((q) => (
          <li key={q.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{q.name} <span className="font-normal text-taupe">· {z(q.created_at)}</span></p>
                  <p className="text-sm"><a className="underline" href={`mailto:${q.email}?subject=Your%20enquiry`}>{q.email}</a>{q.phone && <> · <a className="underline" href={`tel:${q.phone}`}>{q.phone}</a></>}</p>
                </div>
                <StatusBadge status={q.status === "new" ? "pending" : "approved"} />
              </div>
              <p className="mt-3 whitespace-pre-line">{q.message}</p>
              <ActionForm action={enquiryStatusAction} submitLabel={q.status === "new" ? "Mark as handled" : "Mark as new"} submitClassName="btn btn-outline min-h-10 px-4 text-xs">
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="status" value={q.status === "new" ? "handled" : "new"} />
              </ActionForm>
            </Panel>
          </li>
        ))}
      </ul>
    );
  }

  async function Jobs() {
    const rows = await db`SELECT id, kind, recipient, status, attempts, last_error, run_at, sent_at, booking_id FROM notification_jobs ORDER BY (status = 'failed') DESC, id DESC LIMIT 150`;
    if (!rows.length) return <Empty>No emails yet.</Empty>;
    return (
      <div className="border border-line bg-paper">
        <ul className="divide-y divide-line">
          {rows.map((j) => (
            <li key={j.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.2fr_1.5fr_auto_auto] md:items-center">
              <span>{j.kind.replace(/_/g, " ")}{j.booking_id && <> · <Link className="underline" href={`/admin/bookings/${j.booking_id}`}>booking</Link></>}</span>
              <span className="break-all text-taupe">{j.recipient}</span>
              <span className="text-xs text-taupe">{j.status === "pending" ? `due ${z(j.run_at)}` : j.sent_at ? z(j.sent_at) : ""}{j.last_error && j.status === "failed" ? <span className="block text-error">{j.last_error}</span> : null}</span>
              <span className="flex items-center gap-2">
                <StatusBadge status={j.status} />
                {j.status === "failed" && (
                  <ActionForm action={retryJobAction} submitLabel="Retry" submitClassName="btn btn-outline min-h-9 px-3 text-xs"><input type="hidden" name="id" value={j.id} /></ActionForm>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  async function Mailbox({ selected }: { selected: number | null }) {
    const rows = await db`SELECT id, recipient, subject, created_at FROM dev_mailbox ORDER BY id DESC LIMIT 100`;
    const [mail] = selected ? await db`SELECT * FROM dev_mailbox WHERE id = ${selected}` : [];
    return (
      <div>
        <p className="mb-4 text-sm text-taupe">Messages rendered while email delivery is in development mode. They were <strong className="font-medium text-ink">not sent</strong> to anyone.</p>
        {rows.length === 0 ? (
          <Empty>The development mailbox is empty.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto border border-line bg-paper">
              {rows.map((m) => (
                <li key={m.id}>
                  <Link href={`?tab=mailbox&mail=${m.id}`} className={`block px-4 py-3 text-sm ${selected === m.id ? "bg-cream" : "hover:bg-cream/50"}`}>
                    <span className="block font-medium">{m.subject}</span>
                    <span className="block text-xs text-taupe">{m.recipient} · {z(m.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border border-line bg-paper">
              {mail ? (
                <>
                  <div className="border-b border-line px-4 py-3 text-sm"><p className="font-medium">{mail.subject}</p><p className="text-taupe">To {mail.recipient}</p></div>
                  <iframe title="Email preview" sandbox="" srcDoc={mail.html_body ?? `<pre>${mail.text_body}</pre>`} className="h-[60vh] w-full bg-white" />
                </>
              ) : (
                <Empty>Select a message to preview it.</Empty>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}
