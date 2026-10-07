import { z } from "zod";
import { headers } from "next/headers";
import { AccountError, checkLogin, completeProfile, startLogin } from "@/lib/server/customer-auth";
import { profileSchema } from "@/lib/account-schema";
import { assertSameOrigin, errorJson, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";
import { kickWorker } from "@/lib/server/notifications/worker";
import { mailMode } from "@/lib/server/notifications/mailer";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254) }),
  z.object({ action: z.literal("check"), loginId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") }),
  z.object({ action: z.literal("profile"), loginId: z.string().uuid() }).merge(profileSchema),
]);

const STATUS = { invalid_code: 422, expired: 410, rate_limited: 429, invalid: 422 } as const;

/** POST /api/account/login: send a code, check it, then (first time only) save the client's details. */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  const ip = await clientIpHash();
  const ua = (await headers()).get("user-agent");
  try {
    if (data.action === "send") {
      if (!(await rateLimit(`login-send:${ip}`, 10, 3600))) throw new AccountError("Too many codes requested. Please wait a while and try again.", "rate_limited");
      const r = await startLogin(data.email, ip);
      kickWorker();
      return json({ loginId: r.loginId, delivery: mailMode() === "smtp" ? "email" : "development-mailbox" });
    }
    if (!(await rateLimit(`login-check:${ip}`, 30, 3600))) throw new AccountError("Too many attempts. Please wait a while and try again.", "rate_limited");
    if (data.action === "check") return json(await checkLogin(data.loginId, data.code, ua));
    await completeProfile(data.loginId, { name: data.name, phone: data.phone, dateOfBirth: data.dateOfBirth }, ua);
    return json({ status: "signed_in" });
  } catch (err) {
    if (err instanceof AccountError) return errorJson(err.message, STATUS[err.code], { code: err.code });
    throw err;
  }
}
