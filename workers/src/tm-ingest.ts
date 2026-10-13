/**
 * Nightly USPTO trademark corpus ingest (mandate M7.1).
 *
 * The `tm-ingest` queue holds one BullMQ repeatable job that runs at 03:00 UTC
 * (`DAILY_CRON`) for the previous UTC day. It wires the `@markus/tm-data` ingest
 * engine (`runCorpusIngest`) to the persistence seam (`CorpusStore`) and the
 * collector sources; the wiring is kept here, out of the worker bootstrap, so the
 * job can be unit-tested without Redis or PostgreSQL.
 *
 * The nightly feed is the ODP TDXF product, which is gated (FA-011); until it is
 * provisioned the researcher signed-URL backfill (`Trcfeco2Source`) is the only
 * reachable bulk path, so it is the default source.
 */

import { runCorpusIngest, Trcfeco2Source } from "@markus/tm-data";
import type { CorpusStore, IngestReport, TrademarkSource } from "@markus/tm-data";
import type { Env } from "@markus/config";

/** BullMQ queue name (ARCH-01 §4.2). */
export const TM_INGEST_QUEUE = "tm-ingest";

/** 03:00 UTC daily — the corpus run for the previous UTC day. */
export const DAILY_CRON = "0 3 * * *";

/** Job payload; `runDate` is an ISO date string, defaulting to yesterday (UTC). */
export interface TmIngestJobPayload {
  runDate?: string;
}

/**
 * The default collector set: the anonymous researcher backfill only.
 *
 * On FA-011 clearance, prepend `OdpTdxfSource({ baseUrl: env.USPTO_BULK_BASE_URL })`
 * as the nightly feed and keep `Trcfeco2Source` for historical backfill.
 */
export function buildCorpusSources(env: Env): TrademarkSource[] {
  return [
    new Trcfeco2Source({
      baseUrl: env.USPTO_BULK_BASE_URL,
      productId: env.USPTO_RESEARCHER_PRODUCT_ID,
    }),
  ];
}

/**
 * Run one corpus ingest. `runDate` resolves to the payload's ISO date, or to the
 * previous UTC day for the 03:00 scheduled run. `sources` is an injection seam
 * for unit tests; production wiring falls back to {@link buildCorpusSources}.
 */
export function runTmIngest(
  payload: TmIngestJobPayload,
  deps: {
    store: CorpusStore;
    env: Env;
    now?: () => Date;
    sources?: readonly TrademarkSource[];
  },
): Promise<IngestReport> {
  const runDate = payload.runDate ? new Date(payload.runDate) : new Date(Date.now() - 86_400_000);
  return runCorpusIngest({
    runDate,
    sources: deps.sources ?? buildCorpusSources(deps.env),
    store: deps.store,
    now: deps.now,
  });
}
