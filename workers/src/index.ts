/**
 * BullMQ worker entrypoint.
 *
 * Queues are defined in ARCH-01 §4.2:
 *   - domain-events  transactional-outbox delivery (P1, mandate M3.4)
 *   - ocr            document OCR + proofreading (P2)
 *   - tm-ingest      USPTO daily bulk XML ingest (P5)
 *   - archive-sync   WeCom 会话存档 ingest (P3)
 *   - llm            deferred LLM gateway jobs (P5/P6)
 *   - reconcile      daily payment reconciliation (P4)
 *
 * M3.4: with `RUN_WORKER` enabled the worker holds long-lived connections and
 * runs the transactional-outbox relay (`outbox-relay`, ARCH-01 §9.1) on a 5 s
 * tick — unpublished `OutboxEvent` rows are delivered to the `domain-events`
 * queue at least once. Domain-event consumers register with their own phases;
 * the relay is the P1 backbone they deliver onto. Without `RUN_WORKER` the
 * process reports the queue set and exits, which is what the compose smoke test
 * asserts before processors exist.
 */

import { loadEnv } from "@markus/config";
import { OutboxRelay, PrismaOutboxStore, type RelaySink } from "@markus/outbox";
import { PrismaCorpusStore } from "@markus/tm-data";
import type { CorpusTransactionHost } from "@markus/tm-data";
import { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";

import {
  DAILY_CRON,
  isTmIngestSkip,
  runNightlyTmIngest,
  TM_INGEST_QUEUE,
  type TmIngestJobPayload,
} from "./tm-ingest.js";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

export const QUEUE_NAMES = [
  "domain-events",
  "ocr",
  "tm-ingest",
  "archive-sync",
  "llm",
  "reconcile",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** Relay cadence (ARCH-01 §9.1: `outbox-relay`, 5 s tick, 10 s SLA). */
const RELAY_TICK_MS = 5_000;

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
  const queues = new Map<string, InstanceType<typeof Queue>>(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection })]),
  );

  const eventsQueue = queues.get("domain-events");
  if (!eventsQueue) throw new Error("[workers] domain-events queue was not opened");

  const prisma = new PrismaClient();

  /**
   * Relay sink: deliver each outbox row to `domain-events`. `jobId` is the
   * event id so a redelivered row does not create a second queued job; consumers
   * remain idempotent regardless (mandate M3.4).
   */
  const sink: RelaySink = {
    publish: async (record) => {
      await eventsQueue.add(
        record.type,
        {
          id: record.id.toString(),
          aggregateType: record.aggregateType,
          aggregateId: record.aggregateId,
          type: record.type,
          payload: record.payload,
          traceId: record.traceId,
          requestId: record.requestId,
        },
        { jobId: record.id.toString(), removeOnComplete: 1_000, removeOnFail: false },
      );
    },
  };

  const relay = new OutboxRelay(new PrismaOutboxStore(prisma), sink, {
    onExhausted: (record) =>
      console.error(
        `[outbox-relay] event ${record.id.toString()} (${record.type}) exceeded its retry budget; left unpublished for operator replay`,
      ),
  });

  let tmIngestWorker: Worker<string, unknown> | undefined;
  if (env.TM_CORPUS_INGEST_ENABLED) {
    const { Worker } = await import("bullmq");
    tmIngestWorker = new Worker<string, unknown>(
      TM_INGEST_QUEUE,
      async (job) => {
        const result = await runNightlyTmIngest((job.data as TmIngestJobPayload) ?? {}, {
          store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
          env,
        });
        // A researcher-only or gated source (FA-011) already logged its
        // skip-with-reason inside runNightlyTmIngest; the job completes
        // without failure or retry.
        if (isTmIngestSkip(result)) return;
        console.log(
          `[tm-ingest] run=${result.ingestRunId} imported=${result.marksImported} updated=${result.marksUpdated} skipped=${result.marksSkipped} rejected=${result.marksRejected}`,
        );
      },
      { connection, concurrency: 1, lockDuration: 120_000 },
    );
    tmIngestWorker.on("error", (error: Error) =>
      console.error("[tm-ingest] worker error:", error.message),
    );
    await queues
      .get(TM_INGEST_QUEUE)!
      .add("nightly", {} as TmIngestJobPayload, {
        repeat: { pattern: DAILY_CRON },
        removeOnComplete: 100,
      });
    console.log("[tm-ingest] nightly corpora job scheduled (" + DAILY_CRON + ")");
  } else {
    console.log("[tm-ingest] disabled (TM_CORPUS_INGEST_ENABLED)");
  }

  console.log(
    `[workers] connected to redis ${redisEndpoint(env.REDIS_URL)}, queues opened: ${QUEUE_NAMES.join(", ")}`,
  );
  console.log(`[outbox-relay] ticking every ${RELAY_TICK_MS} ms`);

  let ticking = false;
  const tick = async (): Promise<void> => {
    if (ticking) return;
    ticking = true;
    try {
      const result = await relay.drainOnce();
      if (result.claimed > 0) {
        console.log(
          `[outbox-relay] claimed=${result.claimed} published=${result.published} failed=${result.failed}`,
        );
      }
    } catch (error) {
      console.error("[outbox-relay] tick failed:", error instanceof Error ? error.message : error);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => void tick(), RELAY_TICK_MS);
  void tick();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[workers] ${signal} received — shutting down`);
    clearInterval(timer);
    await tmIngestWorker?.close();
    await Promise.all([...queues.values()].map((queue) => queue.close()));
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log("[workers] outbox-relay running");
}

main().catch((error: unknown) => {
  console.error("[workers] fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
