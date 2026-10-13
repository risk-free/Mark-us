/**
 * USPTO trademark data (D-02, mandate M7.1).
 *
 *  - NO TESS scraping (retired; `tmsearch.uspto.gov` has no official search API)
 *  - Nightly USPTO bulk XML (LIVE only: 600 pending + 700 registered) → local
 *    Postgres corpus. The ODP TDXF feed is gated (FA-011); `Trcfeco2Source` is the
 *    anonymous backfill path until it clears.
 *  - TSDR API for per-mark status (daily T+1 batch, M7.3) — not on the corpus path.
 *  - Upgrade paths documented, not built: A2 OpenSearch (TM5 word marks), A3 BGE.
 *
 * The corpus ingest engine lives in `ingest.ts`; word marks only for now.
 */

export { parseCsvText, rowsToRecords } from "./csv.js";
export { corpusFreshness, DEFAULT_FRESHNESS_SLA_HOURS } from "./freshness.js";
export type { CorpusFreshness, CorpusFreshnessStatus } from "./freshness.js";
export { runCorpusIngest, MAX_REJECT_LOG } from "./ingest.js";
export type { IngestReport, RunCorpusIngestOptions } from "./ingest.js";
export { normalizeMarkText } from "./normalize.js";
export {
  isLiveStatus,
  isWordMark,
  parseIsoDate,
  parseResearcherRecord,
  RESEARCHER_COLUMNS,
  WORD_DRAW_CODES,
} from "./researcher.js";
export {
  defaultArchiveDecoder,
  defaultHttpClient,
  OdpTdxfSource,
  SourceUnavailableError,
  Trcfeco2Source,
} from "./source.js";
export type { ArchiveDecoder, ResearcherHttpClient, TrademarkSource, Trcfeco2SourceOptions } from "./source.js";
export { PrismaCorpusStore } from "./store.js";
export type {
  CorpusStore,
  CorpusTransactionHost,
  FinishRunInput,
  RejectEntry,
  RunCounters,
  UpsertAction,
} from "./store.js";
export type { CorpusMarkInput, ParseOutcome } from "./types.js";

/** TSDR per-mark lookup (M7.3) — status only, daily T+1 batch. Lands in P5. */
export interface TsdrStatus {
  serialNumber: string;
  status: string;
  filingDate?: string;
  registrationNumber?: string;
  raw: unknown;
}

export async function fetchTsdr(serialNumber: string): Promise<TsdrStatus> {
  void serialNumber;
  throw new Error("@markus/tm-data: fetchTsdr not implemented (lands with M7.3)");
}
