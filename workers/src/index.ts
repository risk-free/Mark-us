/**
 * BullMQ worker entrypoint (P0 scaffold).
 *
 * Queues defined in the architecture (ARCHITECTURE.md §4):
 *   - ocr            document OCR + proofreading (P2)
 *   - tm-ingest      USPTO daily bulk XML ingest (P5)
 *   - archive-sync   WeCom 会话存档 ingest (P3)
 *   - llm            deferred LLM gateway jobs (P5/P6)
 *   - reconcile      daily payment reconciliation (P4)
 *
 * Workers only connect when RUN_WORKER=1 so that `build`/`typecheck`
 * and local tooling never require a live Redis.
 */

export const QUEUE_NAMES = [
  "ocr",
  "tm-ingest",
  "archive-sync",
  "llm",
  "reconcile",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

async function main(): Promise<void> {
  if (process.env.RUN_WORKER !== "1") {
    console.log(
      "[workers] RUN_WORKER!=1 — scaffold only, no queues started. Queues:",
      QUEUE_NAMES.join(", "),
    );
    return;
  }
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const { Queue } = await import("bullmq");
  const u = new URL(redisUrl);
  const connection = {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
  const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  console.log(`[workers] connected to ${redisUrl}, queues ready:`, QUEUE_NAMES.join(", "));
  await Promise.all(queues.map((q) => q.close()));
}

main().catch((err) => {
  console.error("[workers] fatal:", err);
  process.exit(1);
});
