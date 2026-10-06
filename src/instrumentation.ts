export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const enabled = process.env.WORKER_IN_PROCESS === "true" || process.env.WORKER_IN_PROCESS === "1";
  if (!enabled) return;
  const { startInProcessWorker } = await import("./lib/server/notifications/worker");
  const { cleanupExpiredHolds } = await import("./lib/server/holds");
  startInProcessWorker();
  setInterval(() => void cleanupExpiredHolds().catch((e) => console.error("[holds] cleanup failed", e)), 5 * 60_000);
}
