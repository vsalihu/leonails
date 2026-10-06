import { z } from "zod";
import { sql } from "@/lib/server/db";
import { getSettings } from "@/lib/server/settings";
import { enqueue } from "@/lib/server/notifications/outbox";
import { kickWorker } from "@/lib/server/notifications/worker";
import { assertSameOrigin, errorJson, json, parseJson } from "@/lib/server/http";
import { clientIpHash, rateLimit } from "@/lib/server/rate-limit";
import { hmacHex } from "@/lib/server/crypto";

const body = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().min(10, "Please write a little more so I can help.").max(3000),
  website: z.string().max(0).optional().default(""), // honeypot: real people leave this empty
});

/**
 * POST /api/contact: stores the enquiry (always visible in admin) and queues an
 * email to the business if a notification address is configured. The response
 * reports truthfully what happened.
 */
export async function POST(req: Request) {
  if (!(await assertSameOrigin())) return errorJson("Forbidden.", 403);
  const data = await parseJson(req, body);
  if (data instanceof Response) return data;
  const ip = await clientIpHash();
  const allowed = (await rateLimit(`contact:${ip}`, 5, 3600)) && (await rateLimit(`contact-email:${hmacHex(data.email)}`, 5, 86400));
  if (!allowed) return errorJson("You've sent several messages recently. Please wait a while before sending another.", 429);

  const db = sql();
  const settings = await getSettings();
  const recipient = settings.notificationEmail ?? settings.contactEmail;
  const enquiryId = await db.begin(async (tx) => {
    const [q] = await tx`INSERT INTO enquiries (name, email, phone, message) VALUES (${data.name}, ${data.email}, ${data.phone || null}, ${data.message}) RETURNING id`;
    if (recipient) {
      await enqueue(tx, { kind: "enquiry_received", dedupeKey: `enquiry:${q.id}`, recipient, payload: { enquiryId: q.id } });
    }
    return q.id as number;
  });
  kickWorker();
  return json({ received: true, reference: `E${enquiryId}`, forwarded: !!recipient });
}
