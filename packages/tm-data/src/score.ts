/**
 * Assessment scoring orchestration (P5.4, mandates M6.1/M6.2/M6.4).
 *
 * Turns a query mark into a `P(eventual registration)` signal by searching the
 * corpus, extracting features and applying the versioned model. The result is
 * shaped for `TrademarkAssessment` (append-only): it always carries
 * `modelVersion`, `disclaimerVersion`, non-probabilistic `subSignals`, a
 * `featureSnapshot` and `isLegalAdvice: false`. An empty corpus degrades to
 * `INSUFFICIENT_DATA` rather than a fabricated score (M6.4).
 */

import { type FeatureCandidate, type FeatureVector, extractFeatures, type QueryMark } from "./features.js";
import { type ScoringModel } from "./model.js";
import { SEARCH_DISCLAIMER, SEARCH_METHOD } from "./search.js";

export const INSUFFICIENT_DATA = "INSUFFICIENT_DATA" as const;

export interface AssessmentSubSignals {
  candidateCount: number;
  maxTrigram: number;
  maxPhonetic: number;
  minClassDistance: number;
  goodsMax: number;
}

export interface AssessmentFeatureSnapshot {
  query: QueryMark;
  modelVersion: string;
  topCandidates: Array<{ serialNumber: string; markText: string; score: number }>;
}

export interface AssessmentScore {
  status: "scored" | typeof INSUFFICIENT_DATA;
  /** Null when degraded — never a fabricated headline (M6.4). */
  pRegistration: number | null;
  method: typeof SEARCH_METHOD;
  isLegalAdvice: false;
  disclaimer: string;
  disclaimerVersion: string;
  modelVersion: string;
  subSignals: AssessmentSubSignals;
  featureSnapshot: AssessmentFeatureSnapshot;
  riskFlags: string[];
}

export interface CorpusSearchLike {
  search(
    query: string,
    options?: { limit?: number },
  ): Promise<{ candidates: readonly FeatureCandidate[] }>;
}

const toSubSignals = (features: FeatureVector): AssessmentSubSignals => ({
  candidateCount: features.candidateCount,
  maxTrigram: features.maxTrigram,
  maxPhonetic: features.maxPhonetic,
  minClassDistance: features.minClassDistance,
  goodsMax: features.goodsMax,
});

/**
 * Pure scorer over an explicit candidate set — the replay path for M6.1 (the same
 * query, candidates and model version reproduce the same score).
 */
export function scoreCandidates(
  query: QueryMark,
  candidates: readonly FeatureCandidate[],
  model: ScoringModel,
  disclaimerVersion: string,
): AssessmentScore {
  const features = extractFeatures(query, candidates);
  const riskFlags: string[] = [];

  if (candidates.length === 0) {
    riskFlags.push("NO_CORPUS_CANDIDATES");
    if (features.candidateCount === 0) riskFlags.push(INSUFFICIENT_DATA);
  }

  const degraded = riskFlags.includes(INSUFFICIENT_DATA);

  return {
    status: degraded ? INSUFFICIENT_DATA : "scored",
    pRegistration: degraded ? null : model.score(features),
    method: SEARCH_METHOD,
    isLegalAdvice: false,
    disclaimer: SEARCH_DISCLAIMER,
    disclaimerVersion,
    modelVersion: model.version,
    subSignals: toSubSignals(features),
    featureSnapshot: {
      query,
      modelVersion: model.version,
      topCandidates: candidates
        .slice(0, 10)
        .map((candidate) => ({
          serialNumber: candidate.serialNumber,
          markText: candidate.markText,
          score: candidate.score,
        })),
    },
    riskFlags,
  };
}

export interface CorpusAssessmentScorerOptions {
  searcher: CorpusSearchLike;
  model: ScoringModel;
  disclaimerVersion: string;
  limit?: number;
}

/** Search-backed scorer used by the API/worker path. */
export class CorpusAssessmentScorer {
  readonly #searcher: CorpusSearchLike;
  readonly #model: ScoringModel;
  readonly #disclaimerVersion: string;
  readonly #limit: number;

  constructor(options: CorpusAssessmentScorerOptions) {
    this.#searcher = options.searcher;
    this.#model = options.model;
    this.#disclaimerVersion = options.disclaimerVersion;
    this.#limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  }

  async score(query: QueryMark): Promise<AssessmentScore> {
    const { candidates } = await this.#searcher.search(query.markText, { limit: this.#limit });
    return scoreCandidates(query, candidates, this.#model, this.#disclaimerVersion);
  }
}
