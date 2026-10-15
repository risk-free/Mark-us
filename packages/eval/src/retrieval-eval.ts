/**
 * Retrieval eval (P6.4, gate M5b).
 *
 * Pure and deterministic: it runs the query set against the in-memory BM25
 * index and scores recall@k, precision@k and MRR. No clock, no network, no
 * randomness, so a metric change always means the KB or the dataset changed.
 */

import { searchKb, type KbIndex, type KbSearchHit, type KbLocale } from "@markus/kb";

import type { RetrievalCase } from "./datasets.js";

/** Precision is always measured at three (threshold `retrievalPrecisionAt3`). */
const PRECISION_K = 3;

export interface RetrievalCaseResult {
  id: string;
  query: string;
  locale: KbLocale;
  expectedTopics: readonly string[];
  retrievedTopics: readonly string[];
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
}

export interface RetrievalMiss {
  id: string;
  query: string;
  got: string[];
}

export interface RetrievalEvalReport {
  readonly k: number;
  readonly total: number;
  readonly recallAtK: number;
  readonly precisionAtK: number;
  readonly mrr: number;
  readonly cases: readonly RetrievalCaseResult[];
  readonly misses: readonly RetrievalMiss[];
}

/** Relevant topics in the top `k` hits divided by `k`. */
export function precisionAtK(
  hits: readonly KbSearchHit[],
  expectedTopics: readonly string[],
  k: number,
): number {
  if (k <= 0 || expectedTopics.length === 0) return 0;
  const expected = new Set(expectedTopics);
  const relevant = hits
    .slice(0, k)
    .filter((hit) => expected.has(hit.entry.topic)).length;
  return relevant / k;
}

/** Expected topics found in the top `k` hits divided by the expected count. */
export function recallAtK(
  hits: readonly KbSearchHit[],
  expectedTopics: readonly string[],
  k: number,
): number {
  if (expectedTopics.length === 0) return 0;
  const expected = new Set(expectedTopics);
  const found = new Set<string>();
  for (const hit of hits.slice(0, k)) {
    if (expected.has(hit.entry.topic)) found.add(hit.entry.topic);
  }
  return found.size / expected.size;
}

/** Reciprocal rank of the first hit whose topic is expected (0 if none). */
export function reciprocalRank(
  hits: readonly KbSearchHit[],
  expectedTopics: readonly string[],
): number {
  const expected = new Set(expectedTopics);
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (hit !== undefined && expected.has(hit.entry.topic)) return 1 / (index + 1);
  }
  return 0;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Score every case against `index`. Hits are retrieved with the caller locale
 * preferred and a de-duplicated topic list, exactly as the production RAG
 * pipeline retrieves them.
 */
export function runRetrievalEval(
  index: KbIndex,
  cases: readonly RetrievalCase[],
  opts: { k?: number } = {},
): RetrievalEvalReport {
  const k = opts.k ?? 5;
  const results: RetrievalCaseResult[] = [];
  const misses: RetrievalMiss[] = [];

  for (const testCase of cases) {
    const hits = searchKb(index, testCase.query, {
      locale: testCase.locale,
      limit: Math.max(k, 5),
    });
    const retrievedTopics = hits.map((hit) => hit.entry.topic);
    const recall = recallAtK(hits, testCase.expectedTopics, k);
    const result: RetrievalCaseResult = {
      id: testCase.id,
      query: testCase.query,
      locale: testCase.locale,
      expectedTopics: testCase.expectedTopics,
      retrievedTopics,
      recallAtK: recall,
      precisionAtK: precisionAtK(hits, testCase.expectedTopics, PRECISION_K),
      reciprocalRank: reciprocalRank(hits, testCase.expectedTopics),
    };
    results.push(result);
    if (recall < 1) {
      misses.push({ id: testCase.id, query: testCase.query, got: retrievedTopics });
    }
  }

  return {
    k,
    total: cases.length,
    recallAtK: mean(results.map((result) => result.recallAtK)),
    precisionAtK: mean(results.map((result) => result.precisionAtK)),
    mrr: mean(results.map((result) => result.reciprocalRank)),
    cases: results,
    misses,
  };
}
