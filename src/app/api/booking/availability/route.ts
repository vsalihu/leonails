import { z } from "zod";
import { availableDays, slotsForDate } from "@/lib/server/schedule";
import { getSettings } from "@/lib/server/settings";
import { resolveSelection } from "@/lib/server/catalogue";
import { totalDuration } from "@/lib/pricing";
import { checkoutSession, errorJson, handleError, json } from "@/lib/server/http";
import { rateLimit, clientIpHash } from "@/lib/server/rate-limit";

const query = z.object({
  treatment: z.coerce.number().int().positive(),
  extras: z.string().optional().transform((s) => (s ? s.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** GET /api/booking/availability?treatment=1&extras=2,3[&date=YYYY-MM-DD] */
export async function GET(req: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return errorJson("Invalid request.", 400);
  if (!(await rateLimit(`avail:${await clientIpHash()}`, 240, 600))) return errorJson("Too many requests. Please wait a moment.", 429);
  try {
    const settings = await getSettings();
    if (!settings.bookingsEnabled) return json({ bookingsEnabled: false, durationMinutes: 0, days: [], slots: [] });
    const lines = await resolveSelection(parsed.data.treatment, parsed.data.extras);
    const duration = totalDuration(lines);
    // The visitor's own live hold should not hide the time they're holding.
    const session = (await checkoutSession(false)) ?? undefined;
    if (parsed.data.date) {
      const slots = await slotsForDate(settings, parsed.data.date, duration, { excludeSessionId: session });
      return json({ bookingsEnabled: true, durationMinutes: duration, slots });
    }
    const days = await availableDays(settings, duration, { excludeSessionId: session });
    return json({ bookingsEnabled: true, durationMinutes: duration, timezone: settings.timezone, days });
  } catch (err) {
    return handleError(err);
  }
}
