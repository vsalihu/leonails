import { z } from "zod";
import { requestVerification, verifyCode, BookingError } from "@/lib/server/holds";
import { assertSameOrigin, checkoutSession, errorJson, handleError, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";
import { kickWorker } from "@/lib/server/notifications/worker";
import { mailMode } from "@/lib/server/notifications/mailer";
import { hmacHex } from "@/lib/server/crypto";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), holdId: z.string().uuid(), email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254) }),
  z.object({ action: z.literal("check"), holdId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") }),
]);

/** POST /api/booking/verify: {action:"send", email} sends a code; {action:"check", code} verifies it. */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  const session = await checkoutSession(false);
  if (!session) return handleError(new BookingError("Your session has expired. Please choose a time again.", "hold_expired"));
  const ip = await clientIpHash();
  try {
    if (data.action === "send") {
      const ok = (await rateLimit(`verify-send:${ip}`, 10, 3600)) && (await rateLimit(`verify-send-email:${hmacHex(data.email)}`, 6, 3600));
      if (!ok) throw new BookingError("Too many codes requested. Please wait a while and try again.", "rate_limited");
      const r = await requestVerification(data.holdId, session, data.email);
      kickWorker();
      return json({ sent: true, expiresAt: r.expiresAt, delivery: mailMode() === "smtp" ? "email" : "development-mailbox" });
    }
    if (!(await rateLimit(`verify-check:${ip}`, 30, 3600))) throw new BookingError("Too many attempts. Please wait a while and try again.", "rate_limited");
    const verified = await verifyCode(data.holdId, session, data.code);
    if (!verified) return errorJson("That code isn't right. Please check the latest email and try again.", 422, { code: "invalid_code" });
    return json({ verified: true });
  } catch (err) {
    return handleError(err);
  }
}
