import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/server/env";
import { runDueJobs } from "@/lib/server/notifications/worker";
import { cleanupExpiredHolds } from "@/lib/server/holds";

/** External-scheduler option: POST with `Authorization: Bearer $CRON_SECRET` every minute. */
export async function POST(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  let processed = 0;
  for (let i = 0; i < 5; i++) {
    const r = await runDueJobs();
    processed += r.processed;
    if (r.processed === 0) break;
  }
  await cleanupExpiredHolds();
  return Response.json({ processed });
}
