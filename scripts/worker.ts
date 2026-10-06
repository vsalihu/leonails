/** Standalone outbox worker for hosts that don't run it in the web process. */
import "dotenv/config";
import { runDueJobs } from "../src/lib/server/notifications/worker";
import { cleanupExpiredHolds } from "../src/lib/server/holds";

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  console.log("[worker] started");
  let lastCleanup = 0;
  while (!stopping) {
    try {
      const { processed } = await runDueJobs();
      if (Date.now() - lastCleanup > 5 * 60_000) {
        await cleanupExpiredHolds();
        lastCleanup = Date.now();
      }
      if (processed === 0) await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.error("[worker] error", err);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  console.log("[worker] stopped");
  process.exit(0);
})();
