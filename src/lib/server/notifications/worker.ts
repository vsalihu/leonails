import "server-only";
import { sql } from "../db";
import { env } from "../env";
import { deliver } from "./mailer";
import { render, type JobRow } from "./templates";

const LOCK_SECONDS = 120;

/** Exponential backoff: 1, 2, 4, 8, 16 min ... capped at 1 h. */
function backoffSeconds(attempt: number) {
  return Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Claims and processes due jobs. Safe to run from several processes at once:
 * rows are claimed with FOR UPDATE SKIP LOCKED and a lease (locked_until), so a
 * crashed worker's job becomes claimable again after the lease expires.
 */
export async function runDueJobs(limit = 20): Promise<{ processed: number }> {
  const db = sql();
  const jobs = await db<(JobRow & { attempts: number; max_attempts: number })[]>`
    UPDATE notification_jobs SET status = 'processing', attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${LOCK_SECONDS}), updated_at = now()
    WHERE id IN (
      SELECT id FROM notification_jobs
      WHERE (status = 'pending' AND run_at <= now())
         OR (status = 'processing' AND locked_until < now())
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit})
    RETURNING id, kind, recipient, payload, booking_id, attempts, max_attempts`;

  for (const job of jobs) {
    try {
      const rendered = await render(db, job);
      if ("skip" in rendered) {
        await db`UPDATE notification_jobs SET status = 'skipped', last_error = ${rendered.skip}, locked_until = NULL, updated_at = now() WHERE id = ${job.id}`;
        continue;
      }
      const host = new URL(env().APP_URL).hostname;
      const result = await deliver(
        { to: job.recipient, ...rendered, messageId: `<job-${job.id}@${host}>` },
        job.id,
      );
      await db`
        UPDATE notification_jobs SET status = ${result.status}, provider_message_id = ${result.providerMessageId},
          sent_at = now(), last_error = NULL, locked_until = NULL, updated_at = now()
        WHERE id = ${job.id}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const final = job.attempts >= job.max_attempts;
      await db`
        UPDATE notification_jobs SET
          status = ${final ? "failed" : "pending"},
          run_at = now() + make_interval(secs => ${backoffSeconds(job.attempts)}),
          last_error = ${message.slice(0, 1000)}, locked_until = NULL, updated_at = now()
        WHERE id = ${job.id}`;
    }
  }
  return { processed: jobs.length };
}

/** Admin "retry": re-queues a failed job immediately with a fresh attempt budget. */
export async function retryJob(id: number) {
  await sql()`
    UPDATE notification_jobs SET status = 'pending', run_at = now(), attempts = 0, last_error = NULL, updated_at = now()
    WHERE id = ${id} AND status = 'failed'`;
}

const g = globalThis as unknown as { __workerTimer?: ReturnType<typeof setInterval>; __workerBusy?: boolean };

/** Processes the queue now, without waiting for the next tick (e.g. verification emails). */
export function kickWorker() {
  if (!env().WORKER_IN_PROCESS) return;
  void tick();
}

async function tick() {
  if (g.__workerBusy) return;
  g.__workerBusy = true;
  try {
    let n = 0;
    do {
      n = (await runDueJobs()).processed;
    } while (n > 0);
  } catch (err) {
    console.error("[outbox] worker error", err);
  } finally {
    g.__workerBusy = false;
  }
}

export function startInProcessWorker(intervalMs = 15_000) {
  if (g.__workerTimer) return;
  g.__workerTimer = setInterval(() => void tick(), intervalMs);
  void tick();
  console.log("[outbox] in-process worker started");
}
