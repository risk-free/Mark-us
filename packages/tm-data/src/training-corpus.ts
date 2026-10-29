/**
 * Bounded PostgreSQL corpus stream for offline P5.4.1 training.
 *
 * Features come from the same hybrid searcher and FeatureVector extractor as
 * scoring. The query mark itself and later-filed candidates are excluded in
 * SQL before retrieval limits. Keyset pages feed a bounded global top-N hash
 * sample inside one repeatable-read selection snapshot; per-mark search starts
 * only after selection. No full-corpus result array is materialized and
 * sampling is independent of batch size.
 *
 * Features are reconstructed from the current corpus, not a point-in-time
 * snapshot of historical corpus text/class/goods data. The artifact records
 * this evaluation limitation explicitly.
 */

import { extractFeatures, type FeatureCandidate } from "./features.js";
import type { CorpusSearchCandidate, CorpusSearchOptions, CorpusSqlClient } from "./search.js";
import type { CorpusTrainingRow } from "./train.js";
import {
  DEFAULT_TRAINING_CORPUS_CONFIG,
  trainingSampleRank,
  validateTrainingCorpusConfig,
  type TrainingCorpusConfig,
} from "./training-config.js";

export const TRAINING_CANDIDATE_LIMIT = 20;

interface CorpusOutcomeRow {
  serialNumber: string;
  markText: string;
  statusCode: string;
  filingDate: Date;
  registrationDate: Date | null;
  abandonDate: Date | null;
  goodsSummary: string | null;
  classCodes: number[];
}

interface RankedOutcomeRow {
  row: CorpusOutcomeRow;
  rank: number;
}

export interface TrainingCorpusSearcher {
  search(
    query: string,
    options?: CorpusSearchOptions,
  ): Promise<{ candidates: CorpusSearchCandidate[] }>;
}

export interface TrainingCorpusTransactionOptions {
  isolationLevel: "RepeatableRead";
  maxWait: number;
  timeout: number;
}

/** The Prisma interactive-transaction subset needed for stable keyset selection. */
export interface TrainingCorpusSqlClient extends CorpusSqlClient {
  $transaction<T>(
    callback: (transaction: CorpusSqlClient) => Promise<T>,
    options: TrainingCorpusTransactionOptions,
  ): Promise<T>;
}

export interface TrainingCorpusPageMetric {
  /** Zero-based page index, including the terminating empty page when read. */
  page: number;
  /** Outcome rows in the current keyset page. */
  pageOutcomeRows: number;
  /** Globally sampled rows retained after processing this page. */
  selectedOutcomeRows: number;
  /** Measured page + sample buffer; never exceeds batchSize + maxExamples. */
  bufferedOutcomeRows: number;
}

export interface TrainingCorpusInstrumentation {
  onPage?: (metric: TrainingCorpusPageMetric) => void;
}

/** Ascending rank; the bounded max-heap keeps the globally lowest ranks. */
const compareRank = (left: RankedOutcomeRow, right: RankedOutcomeRow): number =>
  left.rank - right.rank ||
  (left.row.serialNumber < right.row.serialNumber ? -1 : left.row.serialNumber > right.row.serialNumber ? 1 : 0);

const siftDown = (heap: RankedOutcomeRow[], start = 0): void => {
  let parent = start;
  for (;;) {
    const left = parent * 2 + 1;
    if (left >= heap.length) return;
    const right = left + 1;
    const larger = right < heap.length && compareRank(heap[right]!, heap[left]!) > 0 ? right : left;
    if (compareRank(heap[parent]!, heap[larger]!) >= 0) return;
    [heap[parent], heap[larger]] = [heap[larger]!, heap[parent]!];
    parent = larger;
  }
};

const offerSample = (heap: RankedOutcomeRow[], candidate: RankedOutcomeRow, maxExamples: number): void => {
  if (heap.length < maxExamples) {
    heap.push(candidate);
    let child = heap.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (compareRank(heap[child]!, heap[parent]!) <= 0) break;
      [heap[child], heap[parent]] = [heap[parent]!, heap[child]!];
      child = parent;
    }
    return;
  }
  if (compareRank(candidate, heap[0]!) < 0) {
    heap[0] = candidate;
    siftDown(heap);
  }
};

export class PrismaCorpusTrainingSource {
  readonly #sql: TrainingCorpusSqlClient;
  readonly #searcher: TrainingCorpusSearcher;

  constructor(sql: TrainingCorpusSqlClient, searcher: TrainingCorpusSearcher) {
    this.#sql = sql;
    this.#searcher = searcher;
  }

  async #select(
    sql: CorpusSqlClient,
    censusAt: Date,
    config: TrainingCorpusConfig,
    instrumentation: TrainingCorpusInstrumentation,
  ): Promise<RankedOutcomeRow[]> {
    let cursor: { filingDate: Date; serialNumber: string } | null = null;
    const selected: RankedOutcomeRow[] = [];
    for (let page = 0; ; page += 1) {
      const afterDate: Date | null = cursor?.filingDate ?? null;
      const afterSerialNumber: string | null = cursor?.serialNumber ?? null;
      const rows: CorpusOutcomeRow[] = await sql.$queryRaw<CorpusOutcomeRow[]>`
        SELECT
          m."serialNumber",
          m."markText",
          m."statusCode",
          m."filingDate",
          m."registrationDate",
          m."abandonDate",
          m."goodsSummary",
          COALESCE(
            (
              SELECT array_agg(c."classId"::int ORDER BY c."classId")
              FROM "TmCorpusMarkClass" c
              WHERE c."markId" = m."id"
            ),
            '{}'
          ) AS "classCodes"
        FROM "TmCorpusMark" m
        WHERE m."filingDate" IS NOT NULL
          AND m."filingDate" <= ${censusAt}
          AND LEFT(m."statusCode", 1) IN ('6', '7')
          AND (
            ${afterDate}::date IS NULL
            OR m."filingDate" > ${afterDate}::date
            OR (
              m."filingDate" = ${afterDate}::date
              AND m."serialNumber" > ${afterSerialNumber}::text
            )
          )
        ORDER BY m."filingDate" ASC, m."serialNumber" ASC
        LIMIT ${config.batchSize}
      `;

      for (const row of rows) {
        offerSample(
          selected,
          { row, rank: trainingSampleRank(row.serialNumber, config.seed) },
          config.maxExamples,
        );
      }
      instrumentation.onPage?.({
        page,
        pageOutcomeRows: rows.length,
        selectedOutcomeRows: selected.length,
        bufferedOutcomeRows: rows.length + selected.length,
      });
      if (rows.length < config.batchSize) break;
      const last: CorpusOutcomeRow = rows[rows.length - 1]!;
      cursor = { filingDate: last.filingDate, serialNumber: last.serialNumber };
    }
    return selected;
  }

  /**
   * Stream a deterministic bounded sample in keyset order. All keyset pages
   * share one repeatable-read snapshot so concurrent ingest cannot move rows
   * across the cursor. Per-mark retrieval starts after that transaction ends.
   * The caller may retain at most config.maxExamples; trainCorpusModel performs
   * the authoritative label split and release checks.
   */
  async *stream(
    censusAt: Date,
    config: TrainingCorpusConfig = { ...DEFAULT_TRAINING_CORPUS_CONFIG },
    instrumentation: TrainingCorpusInstrumentation = {},
  ): AsyncGenerator<CorpusTrainingRow, void, undefined> {
    if (!Number.isFinite(censusAt.getTime())) throw new Error("censusAt must be a valid date");
    validateTrainingCorpusConfig(config);

    const selected = await this.#sql.$transaction(
      (transaction) => this.#select(transaction, censusAt, config, instrumentation),
      {
        isolationLevel: "RepeatableRead",
        maxWait: 30_000,
        // Offline selection scans the eligible cohort; do not inherit Prisma's
        // short interactive-transaction default for a large corpus.
        timeout: 60 * 60 * 1_000,
      },
    );

    selected.sort(
      (left, right) =>
        left.row.filingDate.getTime() - right.row.filingDate.getTime() ||
        (left.row.serialNumber < right.row.serialNumber ? -1 : left.row.serialNumber > right.row.serialNumber ? 1 : 0),
    );
    for (const { row } of selected) {
      const query = {
        markText: row.markText,
        classCodes: row.classCodes,
        goodsSummary: row.goodsSummary,
      };
      const result = await this.#searcher.search(row.markText, {
        limit: TRAINING_CANDIDATE_LIMIT,
        excludeSerialNumber: row.serialNumber,
        filedBefore: row.filingDate,
      });
      // Keep the in-memory guard for alternative searcher implementations.
      // PostgreSQL applies both predicates before ranking and retrieval limits.
      const candidates: FeatureCandidate[] = result.candidates.filter(
        (candidate) =>
          candidate.serialNumber !== row.serialNumber &&
          candidate.filingDate !== null &&
          candidate.filingDate.getTime() < row.filingDate.getTime(),
      );
      yield {
        serialNumber: row.serialNumber,
        filingDate: row.filingDate,
        registrationDate: row.registrationDate,
        abandonDate: row.abandonDate,
        statusCode: row.statusCode,
        features: extractFeatures(query, candidates),
      };
    }
  }
}
