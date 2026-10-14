/**
 * Feature extraction for the probability model (P5.4).
 *
 * The candidate set from `/tm/search` (trigram) is enriched with phonetic
 * affinity, Nice-class adjacency and goods/services overlap into a compact,
 * deterministic feature vector. Features are **non-probabilistic** — the model
 * converts them to `P(eventual registration)`; they are surfaced as sub-signals
 * and never rendered as percentages (M6.2).
 */

import { closestClassDistance } from "./classes.js";
import { goodsSimilarity } from "./goods.js";
import { normalizeMarkText } from "./normalize.js";
import { phoneticSimilarity } from "./phonetic.js";

export interface QueryMark {
  markText: string;
  classCodes: readonly number[];
  goodsSummary: string | null;
}

export interface FeatureCandidate {
  serialNumber: string;
  markText: string;
  normalizedText?: string;
  /** Trigram similarity in `0..1` from the corpus search. */
  score: number;
  classCodes: readonly number[];
  goodsSummary: string | null;
}

export interface FeatureVector {
  candidateCount: number;
  /** Strongest trigram similarity among candidates (`0..1`). */
  maxTrigram: number;
  /** Mean trigram similarity among candidates (`0..1`). */
  meanTrigram: number;
  /** Strongest phonetic similarity among candidates (`0..1`). */
  maxPhonetic: number;
  /** Closest Nice-class distance to any candidate: `0`, `1` or `2`. */
  minClassDistance: number;
  /** Strongest goods/services overlap among candidates (`0..1`). */
  goodsMax: number;
}

const minClassDistance = (query: QueryMark, candidate: FeatureCandidate): number => {
  if (query.classCodes.length === 0) return 2;
  let best = 2;
  for (const queryClass of query.classCodes) {
    const distance = closestClassDistance(queryClass, candidate.classCodes);
    if (distance < best) best = distance;
    if (best === 0) break;
  }
  return best;
};

/**
 * Deterministic feature vector for a query mark against its ranked candidates.
 * Empty candidate sets yield an all-zero vector with `minClassDistance: 2` (no
 * evidence), which the model must degrade on rather than fabricate a score
 * (M6.4).
 */
export function extractFeatures(query: QueryMark, candidates: readonly FeatureCandidate[]): FeatureVector {
  if (candidates.length === 0) {
    return {
      candidateCount: 0,
      maxTrigram: 0,
      meanTrigram: 0,
      maxPhonetic: 0,
      minClassDistance: 2,
      goodsMax: 0,
    };
  }

  const normalizedQuery = normalizeMarkText(query.markText);
  let maxTrigram = 0;
  let trigramSum = 0;
  let maxPhonetic = 0;
  let minDistance = 2;
  let goodsMax = 0;

  for (const candidate of candidates) {
    maxTrigram = Math.max(maxTrigram, candidate.score);
    trigramSum += candidate.score;

    const normalizedCandidate = candidate.normalizedText ?? normalizeMarkText(candidate.markText);
    maxPhonetic = Math.max(maxPhonetic, phoneticSimilarity(normalizedQuery, normalizedCandidate));
    minDistance = Math.min(minDistance, minClassDistance(query, candidate));
    goodsMax = Math.max(goodsMax, goodsSimilarity(query.goodsSummary, candidate.goodsSummary));
  }

  return {
    candidateCount: candidates.length,
    maxTrigram,
    meanTrigram: trigramSum / candidates.length,
    maxPhonetic,
    minClassDistance: minDistance,
    goodsMax,
  };
}
