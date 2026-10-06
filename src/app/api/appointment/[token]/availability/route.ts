import { availableDays, slotsForDate } from "@/lib/server/schedule";
import { getSettings } from "@/lib/server/settings";
import { bookingFromToken } from "@/lib/server/appointment-api";
import { errorJson, json } from "@/lib/server/http";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await bookingFromToken(token);
  if ("error" in r) return r.error;
  if (r.booking.status !== "confirmed") return errorJson("This appointment can't be moved.", 409);
  const settings = await getSettings();
  const duration = (r.booking.ends_at.getTime() - r.booking.starts_at.getTime()) / 60000;
  const date = new URL(req.url).searchParams.get("date");
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorJson("Invalid date.", 400);
    const slots = await slotsForDate(settings, date, duration, { excludeBookingId: r.booking.id, technicianId: r.booking.technician_id });
    return json({ slots: slots.filter((s) => s.startsAt !== r.booking.starts_at.toISOString()) });
  }
  const days = await availableDays(settings, duration, { excludeBookingId: r.booking.id, technicianId: r.booking.technician_id });
  return json({ days, durationMinutes: duration });
}
