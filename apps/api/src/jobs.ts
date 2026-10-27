/**
 * P5.2 (M7.1): minimal `POST /admin/jobs` enqueue for the corpus-ingest runner.
 *
 * The route validates the job spec and enqueues onto the BullMQ `tm-ingest`
 * queue (ARCH-01 §4.2) that the worker process consumes; job status is read
 * from the `TmIngestRun` ledger via `GET /tm/ingest/runs`. There is no replay
 * endpoint in this slice. Enqueue failures map to a 503 — a queue outage must
 * never crash the API.
 */

import { Queue } from "bullmq";
import type { Redis } from "ioredis";

/** BullMQ queue name (ARCH-01 §4.2). */
export const TM_INGEST_QUEUE = "tm-ingest";

/** Wire payload for one corpus-ingest job; mirrors the worker's job spec. */
export interface TmIngestJobSpec {
  runDate?: string;
  years?: number[];
  table?: string;
  source?: "trcfeco2" | "tdxf";
}

/** Enqueue seam — routes depend on this, never on BullMQ directly. */
export interface JobsQueue {
  add(name: string, payload: TmIngestJobSpec): Promise<{ id?: string | number | undefined }>;
}

/**
 * Production queue on the API's shared Redis connection (the connection's
 * error handler and lifecycle live with the composition root, so a Redis
 * hiccup surfaces here only as a rejected `add`).
 */
export function createTmIngestQueue(connection: Redis): JobsQueue {
  const queue = new Queue(TM_INGEST_QUEUE, { connection });
  return {
    async add(name, payload) {
      const job = await queue.add(name, payload, { removeOnComplete: 100, removeOnFail: false });
      return { id: job.id };
    },
  };
}
