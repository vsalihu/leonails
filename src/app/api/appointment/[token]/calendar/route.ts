import { bookingFromToken } from "@/lib/server/appointment-api";
import { getSettings } from "@/lib/server/settings";
import { sql } from "@/lib/server/db";
import { env } from "@/lib/server/env";

function stamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

/** Private .ics download. Deliberately omits the street address (see the confirmation email). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await bookingFromToken(token);
  if ("error" in r) return r.error;
  const s = await getSettings();
  const [b] = await sql()`SELECT reference FROM bookings WHERE id = ${r.booking.id}`;
  const items = await sql()`SELECT name FROM booking_items WHERE booking_id = ${r.booking.id} ORDER BY sort_order`;
  const host = new URL(env().APP_URL).hostname;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${esc(s.businessName)}//Bookings//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${b.reference}@${host}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(r.booking.starts_at)}`,
    `DTEND:${stamp(r.booking.ends_at)}`,
    `SUMMARY:${esc(`${items.map((i) => i.name).join(" + ")} at ${s.businessName}`)}`,
    `LOCATION:${esc(s.publicLocation)}`,
    `DESCRIPTION:${esc(`Reference ${b.reference}. The full address is in your confirmation email.`)}`,
    r.booking.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment-${b.reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
