import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { sql } from "@/lib/server/db";
import { PageHeader, Panel, StatusBadge, ExampleFlag, Empty } from "@/components/admin/ui";
import { ActionForm, AField } from "@/components/admin/action-form";
import { bestVariant, mediaUrl } from "@/lib/media";
import { addTestimonialAction, inviteAction, moderateAction } from "./actions";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsAdmin() {
  const db = sql();
  const [items, invitable, media] = await Promise.all([
    db`SELECT t.*, m.storage_key, m.variants, b.reference FROM testimonials t LEFT JOIN media_assets m ON m.id = t.media_id LEFT JOIN bookings b ON b.id = t.booking_id ORDER BY (t.status = 'pending') DESC, t.created_at DESC`,
    db`SELECT b.id, b.customer_name, b.starts_at FROM bookings b
       WHERE b.status = 'completed' AND b.starts_at > now() - interval '90 days'
         AND NOT EXISTS (SELECT 1 FROM testimonials t WHERE t.booking_id = b.id)
         AND NOT EXISTS (SELECT 1 FROM notification_jobs j WHERE j.dedupe_key = 'review-invite:' || b.id)
       ORDER BY b.starts_at DESC LIMIT 20`,
    db`SELECT id, alt_text FROM media_assets WHERE usage IN ('gallery','testimonial') AND is_published ORDER BY id DESC LIMIT 100`,
  ]);
  const op = (id: number, opName: string, label: string, confirm?: string, extra?: React.ReactNode) => (
    <ActionForm action={moderateAction} submitLabel={label} submitClassName="btn btn-outline min-h-9 px-3 text-xs" confirm={confirm} className="[&>div]:mt-0">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={opName} />{extra}
    </ActionForm>
  );
  return (
    <>
      <PageHeader title="Reviews" />
      <p className="mb-6 max-w-2xl text-sm text-taupe">Customer reviews arrive as pending and are never published until you approve them.</p>
      {items.length === 0 ? <Empty>No reviews yet.</Empty> : (
        <ul className="space-y-4">
          {items.map((t) => (
            <li key={t.id} className="border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                {t.is_featured && <span className="text-xs font-medium">Featured</span>}
                <ExampleFlag show={t.is_example} />
                <span className="text-sm text-taupe">{t.source === "customer" ? `From a customer${t.reference ? ` (booking ${t.reference})` : ""}` : "Added by admin"} · {DateTime.fromJSDate(t.created_at).toFormat("d LLL yyyy")}</span>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
                {t.storage_key && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl({ key: t.storage_key }, bestVariant({ variants: t.variants }, 480))} alt="Photo attached to the review" className="h-28 w-28 object-cover" />
                )}
                <div>
                  <p className="text-sm">{t.rating ? `${t.rating}/5 · ` : ""}<span className="font-medium">{t.display_name}</span></p>
                  <p className="mt-1">“{t.quote}”</p>
                  <p className="mt-2 text-xs text-taupe">Consent: {t.consent_note ?? (t.consent_given_at ? "given" : "not recorded")}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                {t.status !== "approved" && op(t.id, "approve", t.media_id ? "Approve with photo" : "Approve", undefined, <input type="hidden" name="withPhoto" value="1" />)}
                {t.status !== "approved" && t.media_id && op(t.id, "approve", "Approve without photo")}
                {t.status === "approved" && op(t.id, "feature", t.is_featured ? "Unfeature" : "Feature")}
                {t.status === "approved" && op(t.id, "hide", "Hide")}
                {t.status === "pending" && op(t.id, "reject", "Reject")}
                {op(t.id, "delete", "Delete", "Delete this review permanently?")}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <Panel title="Invite recent clients">
          {invitable.length === 0 ? <Empty>No completed appointments waiting for an invitation.</Empty> : (
            <ul className="divide-y divide-line">
              {invitable.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/admin/bookings/${b.id}`} className="hover:underline">{b.customer_name}, {DateTime.fromJSDate(b.starts_at).toFormat("d LLL")}</Link>
                  <ActionForm action={inviteAction} submitLabel="Send invite" submitClassName="btn btn-outline min-h-9 px-3 text-xs" className="[&>div]:mt-0"><input type="hidden" name="bookingId" value={b.id} /></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Add a review you received elsewhere">
          <ActionForm action={addTestimonialAction} submitLabel="Add review" resetOnSuccess className="grid gap-4">
            <AField name="name" label="Display name"><input name="name" className="input" /></AField>
            <AField name="quote" label="Review"><textarea name="quote" rows={3} className="input" /></AField>
            <AField name="rating" label="Rating (optional)"><select name="rating" className="input" defaultValue=""><option value="">None</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></AField>
            <AField name="mediaId" label="Photo (optional, from the gallery)"><select name="mediaId" className="input" defaultValue=""><option value="">None</option>{media.map((m) => <option key={m.id} value={m.id}>{m.alt_text || `Image ${m.id}`}</option>)}</select></AField>
            <AField name="consent" label="Consent record" help="e.g. 'Asked by text on 3 May, agreed to name and photo'."><input name="consent" className="input" /></AField>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
