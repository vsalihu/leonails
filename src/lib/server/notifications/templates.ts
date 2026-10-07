import "server-only";
import { DateTime } from "luxon";
import type { Db } from "../db";
import { env } from "../env";
import { getSettings, type Settings } from "../settings";
import { getPrivateLocation } from "../private-location";
import { hmac, newNumericCode, newToken, sha256 } from "../crypto";
import { formatPence } from "../../money";

export type JobRow = {
  id: number;
  kind: string;
  recipient: string;
  payload: Record<string, unknown>;
  booking_id: number | null;
};

export type Rendered = { subject: string; text: string; html: string } | { skip: string };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Paragraphs separated by blank lines; lines starting with "> " become detail rows. */
function layout(settings: Settings, heading: string, body: string[], cta?: { label: string; url: string }) {
  const text = [heading, "", ...body.map((p) => p.replace(/^> /gm, "")), ...(cta ? ["", `${cta.label}: ${cta.url}`] : []), "", `${settings.businessName}, ${settings.publicLocation}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#F7F3EC;font-family:Helvetica,Arial,sans-serif;color:#2B211D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#FFFDF9;border:1px solid #E4D9CB">
<tr><td style="padding:28px 32px 8px;font-family:Georgia,serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#6B5A4E">${esc(settings.businessName)}</td></tr>
<tr><td style="padding:8px 32px 0;font-family:Georgia,serif;font-size:26px;line-height:1.25;color:#2B211D">${esc(heading)}</td></tr>
${body
  .map((p) =>
    p.startsWith("> ")
      ? `<tr><td style="padding:12px 32px 0"><table role="presentation" width="100%" style="border-top:1px solid #E4D9CB">${p
          .split("\n")
          .map((l) => l.replace(/^> /, ""))
          .map((l) => {
            const [k, ...v] = l.split(": ");
            return `<tr><td style="padding:8px 0;font-size:14px;color:#6B5A4E;width:40%">${esc(k)}</td><td style="padding:8px 0;font-size:14px">${esc(v.join(": "))}</td></tr>`;
          })
          .join("")}</table></td></tr>`
      : `<tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.6;white-space:pre-line">${esc(p)}</td></tr>`,
  )
  .join("\n")}
${cta ? `<tr><td style="padding:24px 32px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#2B211D;color:#F7F3EC;text-decoration:none;padding:12px 22px;font-size:14px;letter-spacing:.04em">${esc(cta.label)}</a></td></tr>` : ""}
<tr><td style="padding:28px 32px 28px;font-size:12px;color:#6B5A4E">${esc(settings.businessName)}, ${esc(settings.publicLocation)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

async function loadBooking(db: Db, id: number) {
  const [b] = await db`SELECT * FROM bookings WHERE id = ${id}`;
  if (!b) return null;
  const items = await db`SELECT name, price_pence, kind FROM booking_items WHERE booking_id = ${id} ORDER BY sort_order, id`;
  return { b, items };
}

function when(settings: Settings, at: Date) {
  return DateTime.fromJSDate(at, { zone: settings.timezone }).toFormat("cccc d LLLL yyyy 'at' HH:mm");
}

/** Mints a fresh management link (raw token never stored). */
async function mintBookingLink(db: Db, bookingId: number, startsAt: Date, purpose: "manage" | "review"): Promise<string> {
  const token = newToken();
  const days = purpose === "manage" ? 30 : 60;
  const expires = new Date(Math.max(startsAt.getTime(), Date.now()) + days * 86_400_000);
  await db`INSERT INTO booking_access_tokens (token_hash, booking_id, purpose, expires_at) VALUES (${sha256(token)}, ${bookingId}, ${purpose}, ${expires})`;
  return `${env().APP_URL}/${purpose === "manage" ? "appointment" : "review"}/${token}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped database row
function summary(settings: Settings, b: Record<string, any>, items: Record<string, any>[]) {
  const lines = [
    `> When: ${when(settings, b.starts_at)}`,
    ...items.map((i) => `> ${i.kind === "extra" ? "Extra" : "Treatment"}: ${i.name}`),
    ...(b.discount_pence > 0 ? [`> Saving: ${formatPence(b.discount_pence)}${b.promotion_snapshot?.name ? ` (${b.promotion_snapshot.name})` : ""}`] : []),
    `> Total: ${formatPence(b.total_pence)}, pay at your appointment`,
    `> Reference: ${b.reference}`,
  ];
  return lines.join("\n");
}

async function addressBlock(db: Db) {
  const loc = await getPrivateLocation(db);
  if (!loc) return "Your appointment address will be sent separately.";
  return [`Address:\n${loc.addressLines}${loc.postcode ? `\n${loc.postcode}` : ""}`, loc.arrivalInstructions ? `Arrival: ${loc.arrivalInstructions}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

export async function render(db: Db, job: JobRow): Promise<Rendered> {
  const settings = await getSettings(db);
  const p = job.payload;

  switch (job.kind) {
    case "verify_email": {
      const holdId = Number(p.holdId);
      const [hold] = await db`SELECT id, expires_at, released_at, converted_booking_id FROM slot_holds WHERE id = ${holdId}`;
      if (!hold || hold.released_at || hold.converted_booking_id) return { skip: "hold no longer active" };
      if (hold.expires_at.getTime() < Date.now()) return { skip: "hold expired" };
      const code = newNumericCode();
      await db`UPDATE slot_holds SET verification_code_hash = ${hmac(`verify:${holdId}:${code}`)}, verification_attempts = 0 WHERE id = ${holdId}`;
      const { text, html } = layout(settings, `Your code is ${code}`, [
        `Enter this code to confirm your email and finish booking. It expires when your reserved time is released (${DateTime.fromJSDate(hold.expires_at, { zone: settings.timezone }).toFormat("HH:mm")}).`,
        "If you didn't request this, you can ignore this email.",
      ]);
      return { subject: `${code} is your ${settings.businessName} code`, text, html };
    }

    case "customer_login_code": {
      const loginId = Number(p.loginId);
      const [l] = await db`SELECT id, expires_at, verified_at, completed_at FROM customer_login_codes WHERE id = ${loginId}`;
      if (!l || l.verified_at || l.completed_at) return { skip: "sign-in no longer pending" };
      if (l.expires_at.getTime() < Date.now()) return { skip: "sign-in expired" };
      const code = newNumericCode();
      await db`UPDATE customer_login_codes SET code_hash = ${hmac(`login:${loginId}:${code}`)}, attempts = 0 WHERE id = ${loginId}`;
      const { text, html } = layout(settings, `Your sign-in code is ${code}`, [
        `Enter this code to sign in to your ${settings.businessName} account. It expires at ${DateTime.fromJSDate(l.expires_at, { zone: settings.timezone }).toFormat("HH:mm")}.`,
        "If you didn't ask to sign in, you can ignore this email. Nobody can sign in without the code.",
      ]);
      return { subject: `${code} is your ${settings.businessName} sign-in code`, text, html };
    }

    case "booking_confirmation":
    case "booking_rescheduled":
    case "booking_reminder": {
      const data = await loadBooking(db, job.booking_id!);
      if (!data) return { skip: "booking missing" };
      const { b, items } = data;
      if (b.status !== "confirmed") return { skip: `booking is ${b.status}` };
      if (job.kind === "booking_reminder" && p.startsAt !== b.starts_at.toISOString()) return { skip: "appointment time changed" };
      if (b.starts_at.getTime() < Date.now()) return { skip: "appointment already started" };
      const link = await mintBookingLink(db, b.id, b.starts_at, "manage");
      const heading =
        job.kind === "booking_confirmation" ? "Your appointment is confirmed" : job.kind === "booking_rescheduled" ? "Your appointment has moved" : "See you tomorrow";
      const intro =
        job.kind === "booking_reminder"
          ? `A reminder of your appointment, ${b.customer_name}.`
          : job.kind === "booking_rescheduled"
            ? `Hi ${b.customer_name}, your appointment now takes place at the new time below.`
            : `Thank you, ${b.customer_name}. We look forward to seeing you.`;
      const { text, html } = layout(
        settings,
        heading,
        [intro, summary(settings, b, items), await addressBlock(db), "Need to change or cancel? Use the link below. Please keep it private: it gives access to your booking."],
        { label: "Manage appointment", url: link },
      );
      const subject =
        job.kind === "booking_confirmation"
          ? `Confirmed: ${when(settings, b.starts_at)}`
          : job.kind === "booking_rescheduled"
            ? `Rescheduled: ${when(settings, b.starts_at)}`
            : `Reminder: ${when(settings, b.starts_at)}`;
      return { subject, text, html };
    }

    case "booking_cancelled": {
      const data = await loadBooking(db, job.booking_id!);
      if (!data) return { skip: "booking missing" };
      const { b } = data;
      const { text, html } = layout(settings, "Your appointment is cancelled", [
        `Hi ${b.customer_name}, your appointment on ${when(settings, b.starts_at)} (reference ${b.reference}) has been cancelled.`,
        "You're welcome to book again at any time.",
      ], { label: "Book again", url: `${env().APP_URL}/book` });
      return { subject: `Cancelled: ${when(settings, b.starts_at)}`, text, html };
    }

    case "admin_new_booking":
    case "admin_booking_changed": {
      const data = await loadBooking(db, job.booking_id!);
      if (!data) return { skip: "booking missing" };
      const { b, items } = data;
      const heading = job.kind === "admin_new_booking" ? `New booking: ${b.customer_name}` : `Booking ${String(p.change ?? "updated")}: ${b.customer_name}`;
      const { text, html } = layout(settings, heading, [summary(settings, b, items), `Customer: ${b.customer_name}, ${b.customer_email}${b.customer_phone ? `, ${b.customer_phone}` : ""}`], {
        label: "Open in admin",
        url: `${env().APP_URL}/admin/bookings/${b.id}`,
      });
      return { subject: heading, text, html };
    }

    case "review_invite": {
      const data = await loadBooking(db, job.booking_id!);
      if (!data) return { skip: "booking missing" };
      const { b } = data;
      if (b.status !== "completed") return { skip: "booking not completed" };
      const [existing] = await db`SELECT 1 FROM testimonials WHERE booking_id = ${b.id}`;
      if (existing) return { skip: "review already submitted" };
      const link = await mintBookingLink(db, b.id, b.starts_at, "review");
      const { text, html } = layout(settings, "How were your nails?", [
        `Hi ${b.customer_name}, thank you for visiting. If you have a moment, I'd love to hear how your appointment went. You can add a photo too.`,
        "Reviews are read by me before anything appears on the website.",
      ], { label: "Leave a review", url: link });
      return { subject: `How was your visit to ${settings.businessName}?`, text, html };
    }

    case "enquiry_received": {
      const [q] = await db`SELECT * FROM enquiries WHERE id = ${Number(p.enquiryId)}`;
      if (!q) return { skip: "enquiry missing" };
      const { text, html } = layout(settings, `New enquiry from ${q.name}`, [
        `> Name: ${q.name}\n> Email: ${q.email}${q.phone ? `\n> Phone: ${q.phone}` : ""}`,
        q.message,
      ], { label: "View enquiries", url: `${env().APP_URL}/admin/enquiries` });
      return { subject: `Website enquiry from ${q.name}`, text, html };
    }

    case "admin_password_reset": {
      const adminId = Number(p.adminId);
      const token = newToken();
      await db`INSERT INTO admin_password_resets (token_hash, admin_id, expires_at) VALUES (${sha256(token)}, ${adminId}, now() + interval '1 hour')`;
      const { text, html } = layout(settings, "Reset your password", [
        "Someone (hopefully you) asked to reset the admin password. The link below works once and expires in one hour.",
        "If you didn't ask for this, you can ignore this email; your password stays the same.",
      ], { label: "Choose a new password", url: `${env().APP_URL}/admin/reset/${token}` });
      return { subject: "Reset your admin password", text, html };
    }
  }
  return { skip: `unknown job kind ${job.kind}` };
}
