/**
 * Assessment scoring orchestration (P5.4/P5.5, mandates M6.1/M6.2/M6.4).
 *
 * Turns a query mark into a `P(eventual registration)` signal by searching the
 * corpus, extracting features and applying the versioned model. The result is
 * shaped for `TrademarkAssessment` (append-only): it always carries
 * `modelVersion`, `disclaimerVersion`, the 3-locale disclaimer (M6.2),
 * non-probabilistic `subSignals`, a `featureSnapshot`, a confidence band,
 * `recommendedNextActions` and `isLegalAdvice: false`. An empty corpus degrades
 * to `INSUFFICIENT_DATA` rather than a fabricated score (M6.4).
 */

import { disclaimersByLocale, DISCLAIMERS, type DisclaimerLocale } from "./disclaimers.js";
import { type FeatureCandidate, type FeatureVector, extractFeatures, type QueryMark } from "./features.js";
import { type ScoringModel } from "./model.js";
import { SEARCH_METHOD } from "./search.js";
import { type AssessmentConfidence, deriveSuggestions, type RiskFlag } from "./suggest.js";

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
  /** English disclaimer text (back-compat alias of `disclaimers.en`). */
  disclaimer: string;
  /** All three D-03 locales, keyed by locale (M6.2). */
  disclaimers: Record<DisclaimerLocale, string>;
  disclaimerVersion: string;
  modelVersion: string;
  /** Signal strength, not the odds of registration. */
  headlineConfidence: AssessmentConfidence;
  subSignals: AssessmentSubSignals;
  riskFlags: RiskFlag[];
  recommendedNextActions: string[];
  featureSnapshot: AssessmentFeatureSnapshot;
}

export interface CorpusSearchLike {
  search(query: string, options?: { limit?: number }): Promise<{ candidates: FeatureCandidate[] }>;
}

const toSubSignals = (features: FeatureVector): AssessmentSubSignals => ({
  candidateCount: features.candidateCount,
  maxTrigram: features.maxTrigram,
  maxPhonetic: features.maxPhonetic,
  minClassDistance: features.minClassDistance,
  goodsMax: features.goodsMax,
});

/**
 * Score a query against an explicit candidate set. Pure: the same input, model
 * and disclaimer version reproduce the same payload (M6.1 replay).
 */
export function scoreCandidates(
  query: QueryMark,
  candidates: FeatureCandidate[],
  model: ScoringModel,
  disclaimerVersion: string,
): AssessmentScore {
  const features = extractFeatures(query, candidates);
  const degraded = features.candidateCount === 0;

  const suggestion = deriveSuggestions({
    candidateCount: features.candidateCount,
    maxTrigram: features.maxTrigram,
    maxPhonetic: features.maxPhonetic,
    minClassDistance: features.minClassDistance,
    goodsMax: features.goodsMax,
    degraded,
  });

  return {
    status: degraded ? INSUFFICIENT_DATA : "scored",
    pRegistration: degraded ? null : model.score(features),
    method: SEARCH_METHOD,
    isLegalAdvice: false,
    disclaimer: DISCLAIMERS.en.text,
    disclaimers: disclaimersByLocale(),
    disclaimerVersion,
    modelVersion: model.version,
    headlineConfidence: suggestion.headlineConfidence,
    subSignals: toSubSignals(features),
    riskFlags: suggestion.riskFlags,
    recommendedNextActions: suggestion.recommendedNextActions,
    featureSnapshot: {
      query,
      modelVersion: model.version,
      topCandidates: candidates.slice(0, 10).map((candidate) => ({
        serialNumber: candidate.serialNumber,
        markText: candidate.markText,
        score: candidate.score,
      })),
    },
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
