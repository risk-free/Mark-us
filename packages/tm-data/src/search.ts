/**
 * Corpus search (mandate M7.2).
 *
 * `/tm/search` is a **signal, not an opinion**: it ranks similar marks with
 * `pg_trgm` similarity over `TmCorpusMark.normalizedText` (GIN index, enforced in
 * the migration) and returns the method used, a fixed disclaimer and
 * `isLegalAdvice: false`. Ranking never blocks a filing.
 *
 * The query is normalised exactly once at the boundary (same transform as
 * ingest) and the response's `minScore` is the `pg_trgm` operator default; a
 * tunable per-deployment threshold is a future config knob, not a contract.
 */

import { normalizeMarkText } from "./normalize.js";

export const SEARCH_METHOD = "trigram" as const;

/** `pg_trgm.similarity_threshold` default — the `%` operator's floor. */
export const SEARCH_MIN_SCORE = 0.3;

export const SEARCH_DISCLAIMER =
  "Mark-US search output is a similarity signal only — it is not legal advice, does not " +
  "guarantee registrability, and never blocks a filing. A qualified trademark attorney decides.";

export interface CorpusSearchCandidate {
  serialNumber: string;
  registrationNumber: string | null;
  markText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  goodsSummary: string | null;
  /** Nice class codes (1..45) the mark is filed in. */
  classCodes: number[];
  score: number;
}

export interface CorpusSearchResult {
  query: string;
  method: typeof SEARCH_METHOD;
  minScore: number;
  isLegalAdvice: false;
  disclaimer: string;
  candidates: CorpusSearchCandidate[];
}

export interface CorpusSearchOptions {
  /** Max candidates returned (clamped to 100). */
  limit?: number;
}

/** Structural view of the raw-SQL surface used by `PrismaCorpusSearcher`. */
export interface CorpusSqlClient {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

interface CorpusSearchRow {
  serialNumber: string;
  registrationNumber: string | null;
  markText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  goodsSummary: string | null;
  classCodes: number[];
  score: number;
}

/**
 * Search against the GIN trigram index. The host is the Prisma client, cast at
 * the assembly boundary (same pattern as `PrismaCorpusStore`), so this package
 * stays free of a generated-client dependency.
 */
export class PrismaCorpusSearcher {
  readonly #sql: CorpusSqlClient;

  constructor(sql: CorpusSqlClient) {
    this.#sql = sql;
  }

  async search(query: string, options: CorpusSearchOptions = {}): Promise<CorpusSearchResult> {
    const normalized = normalizeMarkText(query);
    if (normalized.length === 0) {
      return {
        query,
        method: SEARCH_METHOD,
        minScore: SEARCH_MIN_SCORE,
        isLegalAdvice: false,
        disclaimer: SEARCH_DISCLAIMER,
        candidates: [],
      };
    }

    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const rows = await this.#sql.$queryRaw<CorpusSearchRow[]>`
      SELECT
        m."serialNumber",
        m."registrationNumber",
        m."markText",
        m."statusCode",
        m."filingDate",
        m."registrationDate",
        m."goodsSummary",
        similarity(m."normalizedText", ${normalized}) AS score,
        COALESCE(
          (
            SELECT array_agg(c."classId"::int ORDER BY c."classId")
            FROM "TmCorpusMarkClass" c
            WHERE c."markId" = m."id"
          ),
          '{}'
        ) AS "classCodes"
      FROM "TmCorpusMark" m
      WHERE m."normalizedText" % ${normalized}
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return {
      query,
      method: SEARCH_METHOD,
      minScore: SEARCH_MIN_SCORE,
      isLegalAdvice: false,
      disclaimer: SEARCH_DISCLAIMER,
      candidates: rows.map((row) => ({ ...row })),
    };
  }
}