/**
 * Corpus search (mandate M7.2; hybrid similarity v1, P5.3).
 *
 * `/tm/search` is a **signal, not an opinion**: PostgreSQL retrieves a bounded
 * candidate pool with the `pg_trgm` GIN index over
 * `TmCorpusMark.normalizedText`; the search layer then fuses trigram, phonetic
 * and Nice-class adjacency into one score. Every result carries the method, a
 * fixed disclaimer and `isLegalAdvice: false`. Ranking never blocks a filing.
 *
 * The query is normalised exactly once at this boundary (same transform as
 * ingest). Phonetic scoring compares that value with the already-normalised
 * candidate text, so no second query normalisation hides in a component.
 */

import { closestClassDistance, normalizeClass } from "./classes.js";
import { DISCLAIMERS } from "./disclaimers.js";
import { normalizeMarkText } from "./normalize.js";
import { phoneticSimilarity } from "./phonetic.js";

export const SEARCH_METHOD = "hybrid" as const;

/** Default floor applied to the fused score (not to an individual feature). */
export const SEARCH_MIN_SCORE = 0.3;

/** Bounded rerank pool (ARCH-02 Q7); the response limit is applied after fusion. */
export const SEARCH_CANDIDATE_POOL_SIZE = 200;

/** v1 tuning knobs only; eval-driven retuning belongs to P5.4. */
export const HYBRID_WEIGHTS = {
  trigram: 0.65,
  phonetic: 0.25,
  classAdjacency: 0.1,
} as const;

/** Without a query Nice class, renormalise over text features only. */
export const HYBRID_NO_CLASS_WEIGHTS = {
  trigram: 0.72,
  phonetic: 0.28,
} as const;

/** The D-03 disclosure that ships with every similarity/score payload (M6.2). */
export const SEARCH_DISCLAIMER = DISCLAIMERS.en.text;

export interface HybridScoreFeatures {
  trigram: number;
  phonetic: number;
  /** `1` identical class, `0.5` related, `0` distant; omit when the query has no class. */
  classAdjacency?: number;
}

const clampUnit = (value: number): number => Math.max(0, Math.min(value, 1));

/** Fuse the v1 features and clamp the composite to `0..1`. */
export function hybridSearchScore(features: HybridScoreFeatures): number {
  const score =
    features.classAdjacency === undefined
      ? HYBRID_NO_CLASS_WEIGHTS.trigram * features.trigram +
        HYBRID_NO_CLASS_WEIGHTS.phonetic * features.phonetic
      : HYBRID_WEIGHTS.trigram * features.trigram +
        HYBRID_WEIGHTS.phonetic * features.phonetic +
        HYBRID_WEIGHTS.classAdjacency * features.classAdjacency;
  return clampUnit(score);
}

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
  /** Fused trigram + phonetic + class-adjacency score in `0..1`. */
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
  /** Query Nice class used for adjacency scoring; absent selects text-only weights. */
  niceClass?: number | string;
  /** Live corpus status filter: 600 pending or 700 registered. */
  statusCode?: "600" | "700";
  /** Composite-score floor (clamped to `0..1`). */
  minScore?: number;
}

/** Structural view of the raw-SQL surface used by `PrismaCorpusSearcher`. */
export interface CorpusSqlClient {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

interface CorpusSearchRow {
  serialNumber: string;
  registrationNumber: string | null;
  markText: string;
  normalizedText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  goodsSummary: string | null;
  classCodes: number[];
  trigramScore: number;
}

const resolveMinScore = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? clampUnit(value) : SEARCH_MIN_SCORE;

/**
 * Search against the GIN trigram index, then rerank the bounded pool with the
 * hybrid v1 features. The host is the Prisma client, cast at the assembly
 * boundary (same pattern as `PrismaCorpusStore`), so this package stays free
 * of a generated-client dependency.
 */
export class PrismaCorpusSearcher {
  readonly #sql: CorpusSqlClient;

  constructor(sql: CorpusSqlClient) {
    this.#sql = sql;
  }

  async search(query: string, options: CorpusSearchOptions = {}): Promise<CorpusSearchResult> {
    const normalized = normalizeMarkText(query);
    const minScore = resolveMinScore(options.minScore);
    if (normalized.length === 0) {
      return {
        query,
        method: SEARCH_METHOD,
        minScore,
        isLegalAdvice: false,
        disclaimer: SEARCH_DISCLAIMER,
        candidates: [],
      };
    }

    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const niceClass = options.niceClass === undefined ? null : normalizeClass(options.niceClass);
    const statusCode = options.statusCode ?? null;
    const rows = await this.#sql.$queryRaw<CorpusSearchRow[]>`
      SELECT
        m."serialNumber",
        m."registrationNumber",
        m."markText",
        m."normalizedText",
        m."statusCode",
        m."filingDate",
        m."registrationDate",
        m."goodsSummary",
        similarity(m."normalizedText", ${normalized}) AS "trigramScore",
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
        AND (${statusCode}::text IS NULL OR m."statusCode" = ${statusCode})
      ORDER BY "trigramScore" DESC, m."serialNumber" ASC
      LIMIT ${SEARCH_CANDIDATE_POOL_SIZE}
    `;

    const candidates = rows
      .map((row): CorpusSearchCandidate => {
        const classAdjacency =
          niceClass === null
            ? undefined
            : (2 - closestClassDistance(niceClass, row.classCodes)) / 2;
        return {
          serialNumber: row.serialNumber,
          registrationNumber: row.registrationNumber,
          markText: row.markText,
          statusCode: row.statusCode,
          filingDate: row.filingDate,
          registrationDate: row.registrationDate,
          goodsSummary: row.goodsSummary,
          classCodes: row.classCodes,
          score: hybridSearchScore({
            trigram: row.trigramScore,
            phonetic: phoneticSimilarity(normalized, row.normalizedText),
            ...(classAdjacency === undefined ? {} : { classAdjacency }),
          }),
        };
      })
      .filter((candidate) => candidate.score >= minScore)
      .sort(
        (left, right) =>
          right.score - left.score || left.serialNumber.localeCompare(right.serialNumber),
      )
      .slice(0, limit);

    return {
      query,
      method: SEARCH_METHOD,
      minScore,
      isLegalAdvice: false,
      disclaimer: SEARCH_DISCLAIMER,
      candidates,
    };
  }
}
