/**
 * Nightly USPTO trademark corpus ingest (mandate M7.1).
 *
 * The `tm-ingest` queue holds one BullMQ repeatable job that runs at 03:00 UTC
 * (`DAILY_CRON`) for the previous UTC day; ad-hoc backfills run in-process via
 * the `ingest:backfill` CLI (P5.2) — no Redis dependency, no HTTP surface. The
 * wiring lives here, out of the worker bootstrap, so the job can be
 * unit-tested without Redis or PostgreSQL.
 *
 * The nightly feed is the ODP TDXF product, which is gated (FA-011); the
 * researcher signed-URL snapshot (`Trcfeco2Source`) is a static one-time
 * backfill, so while the effective source set is researcher-only the nightly
 * tick skips with reason instead of re-ingesting the static snapshot every
 * night. The cron registration stays for the `OdpTdxfSource` swap-in day.
 * Selecting `tdxf` (job spec or env) before FA-011 clears likewise yields an
 * honest skip-with-reason, never a failed job.
 */

import { OdpTdxfSource, runCorpusIngest, SourceUnavailableError, Trcfeco2Source } from "@markus/tm-data";
import type { CorpusStore, IngestReport, TrademarkSource } from "@markus/tm-data";
import type { Env } from "@markus/config";

/** BullMQ queue name (ARCH-01 §4.2). */
export const TM_INGEST_QUEUE = "tm-ingest";

/** 03:00 UTC daily — the corpus run for the previous UTC day. */
export const DAILY_CRON = "0 3 * * *";

/** Corpus ingest source selector (P5.2); mirrors `TM_CORPUS_INGEST_SOURCE`. */
export type CorpusIngestSourceName = "trcfeco2" | "tdxf";

/**
 * Job payload. `runDate` is an ISO date string, defaulting to yesterday (UTC).
 * `years`/`table`/`source` select the backfill slice; unset fields fall back
 * to env config (`TM_CORPUS_INGEST_YEARS` / `TM_CORPUS_INGEST_SOURCE`).
 */
export interface TmIngestJobPayload {
  runDate?: string;
  years?: number[];
  table?: string;
  source?: CorpusIngestSourceName;
}

/**
 * Skip sentinel returned instead of throwing when the selected source is
 * gated (FA-011): the tick logs a skip-with-reason and the BullMQ job
 * completes, so a gated source never produces a retry storm.
 */
export interface TmIngestSkip {
  skipped: true;
  code: string;
  reason: string;
}

export const isTmIngestSkip = (result: IngestReport | TmIngestSkip): result is TmIngestSkip =>
  "skipped" in result && result.skipped === true;

/** Fully-resolved ingest slice: payload fields win over env, env over default. */
export interface ResolvedIngestSpec {
  source: CorpusIngestSourceName;
  years: number[] | undefined;
  table: string;
}

export function resolveIngestSpec(
  env: Env,
  payload: Pick<TmIngestJobPayload, "years" | "table" | "source">,
): ResolvedIngestSpec {
  return {
    source: payload.source ?? env.TM_CORPUS_INGEST_SOURCE ?? "trcfeco2",
    years: payload.years ?? env.TM_CORPUS_INGEST_YEARS,
    table: payload.table ?? "case_file",
  };
}

/**
 * The default collector set. On FA-011 clearance, `tdxf` (job spec or
 * `TM_CORPUS_INGEST_SOURCE`) swaps `OdpTdxfSource` in as the nightly feed —
 * a config change, nothing more; `Trcfeco2Source` stays for backfill.
 */
export function buildCorpusSources(
  env: Env,
  spec: Pick<TmIngestJobPayload, "years" | "table" | "source"> = {},
): TrademarkSource[] {
  const resolved = resolveIngestSpec(env, spec);
  if (resolved.source === "tdxf") {
    return [new OdpTdxfSource({ baseUrl: env.USPTO_BULK_BASE_URL })];
  }
  return [
    new Trcfeco2Source({
      baseUrl: env.USPTO_BULK_BASE_URL,
      productId: env.USPTO_RESEARCHER_PRODUCT_ID,
      ...(resolved.years === undefined ? {} : { years: resolved.years }),
      table: resolved.table,
    }),
  ];
}

/**
 * Run one corpus ingest. `runDate` resolves to the payload's ISO date, or to
 * the previous UTC day for the 03:00 scheduled run. `sources` is an injection
 * seam for unit tests; production wiring falls back to {@link buildCorpusSources}.
 *
 * FA-011 honest skip: a gated `OdpTdxfSource` logs a skip-with-reason and
 * resolves with {@link TmIngestSkip} **before** a ledger run is opened, so the
 * nightly tick neither fails nor records a bogus failed attempt. A source that
 * throws FA-011 mid-run is treated the same; every other error propagates so
 * BullMQ records the failure (the engine has already written `failRun`).
 */
export async function runTmIngest(
  payload: TmIngestJobPayload,
  deps: {
    store: CorpusStore;
    env: Env;
    now?: () => Date;
    sources?: readonly TrademarkSource[];
  },
): Promise<IngestReport | TmIngestSkip> {
  const runDate = payload.runDate ? new Date(payload.runDate) : new Date(Date.now() - 86_400_000);
  const sources = deps.sources ?? buildCorpusSources(deps.env, payload);

  if (sources.some((source) => source instanceof OdpTdxfSource)) {
    const reason =
      "USPTO ODP TDXF feed is gated (FA-011): firm ODP account not provisioned; nightly run skipped";
    console.log(`[tm-ingest] skip-with-reason: ${reason}`);
    return { skipped: true, code: "FA-011", reason };
  }

  try {
    return await runCorpusIngest({
      runDate,
      sources,
      store: deps.store,
      now: deps.now,
    });
  } catch (error) {
    if (error instanceof SourceUnavailableError && error.code === "FA-011") {
      console.log(`[tm-ingest] skip-with-reason: ${error.message}`);
      return { skipped: true, code: error.code, reason: error.message };
    }
    throw error;
  }
}

/** Skip reason logged by the nightly tick while FA-011 keeps the feed researcher-only. */
export const RESEARCHER_ONLY_NIGHTLY_REASON =
  "researcher snapshot static; TDXF nightly pending FA-011";

/**
 * The 03:00 UTC nightly tick (P5.2). While the effective source set is
 * researcher-only — the static TRCFECO2 snapshot is a one-time backfill, not a
 * nightly feed — the tick logs {@link RESEARCHER_ONLY_NIGHTLY_REASON} and
 * completes without opening a ledger run. Once FA-011 clears and `tdxf` is
 * selected the source set stops being researcher-only and the tick runs the
 * TDXF feed (still FA-011-honest until the adapter is implemented).
 */
export async function runNightlyTmIngest(
  payload: TmIngestJobPayload,
  deps: {
    store: CorpusStore;
    env: Env;
    now?: () => Date;
    sources?: readonly TrademarkSource[];
  },
): Promise<IngestReport | TmIngestSkip> {
  const sources = deps.sources ?? buildCorpusSources(deps.env, payload);
  if (sources.every((source) => source instanceof Trcfeco2Source)) {
    console.log(`[tm-ingest] skip-with-reason: ${RESEARCHER_ONLY_NIGHTLY_REASON}`);
    return { skipped: true, code: "FA-011", reason: RESEARCHER_ONLY_NIGHTLY_REASON };
  }
  return runTmIngest(payload, { ...deps, sources });
}
