/**
 * Corpus ingest engine (mandate M7.1).
 *
 * Consumes one or more `TrademarkSource`s and upserts every word mark into
 * `TmCorpusMark` with `sourceUpdatedAt` + `ingestRunId` provenance. The run is
 * resumable (a crash leaves the `TmIngestRun` row `running`; re-running the same
 * `runDate` resumes it and duplicate rows are absorbed by the natural key), and
 * it reports imported / updated / skipped / rejected. A malformed record is
 * quarantined into the reject count (and `errorLog`) — it never fails the run.
 *
 * The engine depends only on `CorpusStore` and `TrademarkSource`, so its control
 * flow is unit-tested with doubles; the real store is exercised against
 * PostgreSQL (ARCH-01 §13).
 */

import type { CorpusStore, RejectEntry, RunCounters, UpsertAction } from "./store.js";
import type { TrademarkSource } from "./source.js";

/** Cap on quarantined rows persisted to `TmIngestRun.errorLog`. */
export const MAX_REJECT_LOG = 200;

export interface RunCorpusIngestOptions {
  runDate: Date;
  sources: readonly TrademarkSource[];
  store: CorpusStore;
  /** Override the reject-log cap (default `MAX_REJECT_LOG`). */
  maxRejectLog?: number;
  /** Clock injection for deterministic `finishedAt` in tests. */
  now?: () => Date;
}

export interface IngestReport extends RunCounters {
  ingestRunId: string;
  startedAt: Date;
  finishedAt: Date;
  errorLog: RejectEntry[];
}

export async function runCorpusIngest(options: RunCorpusIngestOptions): Promise<IngestReport> {
  const { runDate, sources, store, maxRejectLog = MAX_REJECT_LOG } = options;
  const now = options.now ?? (() => new Date());

  const startedAt = now();
  const ingestRunId = await store.startRun(runDate);
  const errorLog: RejectEntry[] = [];
  const counters: RunCounters = {
    filesProcessed: 0,
    marksUpserted: 0,
    marksSkipped: 0,
    marksImported: 0,
    marksUpdated: 0,
    marksRejected: 0,
  };

  try {
    for (const source of sources) {
      for await (const outcome of source.fetchRecords(runDate)) {
        if (outcome.kind === "reject") {
          counters.marksRejected += 1;
          if (errorLog.length < maxRejectLog) {
            errorLog.push({ reason: outcome.reason, raw: outcome.raw });
          }
          continue;
        }
        if (outcome.kind === "skip") {
          counters.marksSkipped += 1;
          continue;
        }
        const action: UpsertAction = await store.upsertMark(outcome.record, ingestRunId);
        if (action === "imported") counters.marksImported += 1;
        else if (action === "updated") counters.marksUpdated += 1;
        else counters.marksSkipped += 1;
      }
      counters.filesProcessed += 1;
    }
  } catch (error) {
    await store.failRun(ingestRunId, { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  counters.marksUpserted = counters.marksImported + counters.marksUpdated;
  const finishedAt = now();
  await store.finishRun(ingestRunId, { ...counters, errorLog: errorLog.length > 0 ? errorLog : null, finishedAt });

  return { ingestRunId, startedAt, finishedAt, ...counters, errorLog };
}
