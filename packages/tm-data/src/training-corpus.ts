/**
 * PostgreSQL corpus reader for offline P5.4 training.
 *
 * Features come from the same hybrid searcher and FeatureVector extractor as
 * scoring. The query mark itself and later-filed candidates are excluded. The
 * current-corpus reconstruction limitation remains an evaluation caveat; this
 * code does not claim a point-in-time snapshot of historical corpus text. Its
 * deliberately simple in-memory, per-mark assembly is the P5.4 code-gate
 * implementation; streaming/batched full-corpus execution is a separate task.
 */

import { extractFeatures, type FeatureCandidate } from "./features.js";
import type { CorpusSearchCandidate, CorpusSearchOptions, CorpusSqlClient } from "./search.js";
import type { CorpusTrainingRow } from "./train.js";

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

export interface TrainingCorpusSearcher {
  search(
    query: string,
    options?: CorpusSearchOptions,
  ): Promise<{ candidates: CorpusSearchCandidate[] }>;
}

export class PrismaCorpusTrainingSource {
  readonly #sql: CorpusSqlClient;
  readonly #searcher: TrainingCorpusSearcher;

  constructor(sql: CorpusSqlClient, searcher: TrainingCorpusSearcher) {
    this.#sql = sql;
    this.#searcher = searcher;
  }

  /** Read resolved and censored rows; trainCorpusModel performs the label split. */
  async assemble(censusAt: Date): Promise<CorpusTrainingRow[]> {
    const rows = await this.#sql.$queryRaw<CorpusOutcomeRow[]>`
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
      ORDER BY m."filingDate" ASC, m."serialNumber" ASC
    `;

    const examples: CorpusTrainingRow[] = [];
    for (const row of rows) {
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
      // Keep the in-memory guard for alternative searcher implementations. The
      // real PostgreSQL searcher applies both predicates before ranking/limits.
      const candidates: FeatureCandidate[] = result.candidates.filter(
        (candidate) =>
          candidate.serialNumber !== row.serialNumber &&
          candidate.filingDate !== null &&
          candidate.filingDate.getTime() < row.filingDate.getTime(),
      );
      examples.push({
        serialNumber: row.serialNumber,
        filingDate: row.filingDate,
        registrationDate: row.registrationDate,
        abandonDate: row.abandonDate,
        statusCode: row.statusCode,
        features: extractFeatures(query, candidates),
      });
    }
    return examples;
  }
}
