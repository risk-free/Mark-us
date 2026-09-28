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
 * RUN_WORKER=1 opens the queues; no processors are registered until P2, so the
 * process reports that it has nothing to consume and exits. Processors land with
 * their phases, at which point this becomes a long-running service.
 */

import { loadEnv } from "@markus/config";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

export const QUEUE_NAMES = [
  "ocr",
  "tm-ingest",
  "archive-sync",
  "llm",
  "reconcile",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

function redisEndpoint(redisUrl: string): string {
  const url = new URL(redisUrl);
  const db = url.pathname && url.pathname !== "/" ? url.pathname.slice(1) : "0";
  return `${url.protocol}//${url.hostname}:${url.port || 6379}/${db}`;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.RUN_WORKER) {
    console.log(
      `[workers] RUN_WORKER is not enabled — no queues opened. Queues: ${QUEUE_NAMES.join(", ")}`,
    );
    return;
  }

  const { Queue } = await import("bullmq");
  const { Redis } = await import("ioredis");

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  console.log(
    `[workers] connected to redis ${redisEndpoint(env.REDIS_URL)}, queues opened: ${QUEUE_NAMES.join(", ")}`,
  );

  await Promise.all(queues.map((queue) => queue.close()));
  await connection.quit();

  console.log(
    "[workers] no processors are registered until P2 (ocr) — nothing to consume, exiting",
  );
}

main().catch((error: unknown) => {
  console.error("[workers] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
