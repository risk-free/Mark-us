/**
 * Versioned probability model (P5.4, mandate M6.1).
 *
 * `P(eventual registration)` is produced by a **versioned** scorer so every
 * stored assessment can name the model that produced it (append-only, replay-safe).
 * The `bootstrap` model is a hand-set logistic scorer used until a model is
 * trained and passes the M6.5 calibration gate (`eval.ts`); the constant
 * `BASELINE_MODEL` is the naive base-rate comparator the candidate must beat by
 * ≥10 pp (M5a). Coefficients live in code only for the bootstrap; a trained model
 * ships its coefficients from the offline pipeline.
 */

import type { FeatureVector } from "./features.js";

export interface ScoringModel {
  readonly version: string;
  /** `P(eventual registration)` in `0..1`. */
  score(features: FeatureVector): number;
}

/** Modern-cohort base rate measured by the P5.1 spike (ARCH-05 §3). */
export const BASE_RATE = 0.6;

/** Bumped whenever the disclaimer copy changes; stamped on every assessment (M6.2). */
export const DISCLAIMER_VERSION = "disclaimer-1.0.0";

export const BASELINE_MODEL_VERSION = "baseline-base-rate";
export const BOOTSTRAP_MODEL_VERSION = "bootstrap-0.1.0";

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** The naive baseline: a constant `BASE_RATE` score; no signal, no lift. */
export const BASELINE_MODEL = {
  version: BASELINE_MODEL_VERSION,
  score: (): number => BASE_RATE,
} as const satisfies ScoringModel;

export interface LogisticCoefficients {
  intercept: number;
  trigram: number;
  phonetic: number;
  classAdjacency: number;
  goods: number;
  /** Negative: a crowded field (many similar marks) lowers registration odds. */
  crowdedness: number;
}

/** Bounded, model-facing scalars; every input is already in `0..1`. */
const toScalars = (features: FeatureVector): {
  trigram: number;
  phonetic: number;
  classAdjacency: number;
  goods: number;
  crowdedness: number;
} => ({
  trigram: clamp01(features.maxTrigram),
  phonetic: clamp01(features.maxPhonetic),
  classAdjacency: features.minClassDistance === 0 ? 1 : features.minClassDistance === 1 ? 0.5 : 0,
  goods: clamp01(features.goodsMax),
  crowdedness: Math.min(features.candidateCount, 10) / 10,
});

/**
 * Build a logistic scorer from fixed coefficients. Deterministic: the same
 * features and coefficients always produce the same score (M6.1 replay).
 */
export function createLogisticScorer(coefficients: LogisticCoefficients, version: string): ScoringModel {
  return {
    version,
    score: (features) => {
      const scalars = toScalars(features);
      const z =
        coefficients.intercept +
        coefficients.trigram * scalars.trigram +
        coefficients.phonetic * scalars.phonetic +
        coefficients.classAdjacency * scalars.classAdjacency +
        coefficients.goods * scalars.goods +
        coefficients.crowdedness * scalars.crowdedness;
      return clamp01(1 / (1 + Math.exp(-z)));
    },
  };
}

/**
 * Hand-set bootstrap coefficients for the untrained cold-start model. Signs and
 * relative magnitudes encode the domain prior (similarity raises registration
 * odds, a crowded field lowers them); they are replaced by fitted values once a
 * real labelled cohort exists (blocked on the TDXF integrity of D-26 §3 / FA-011).
 */
export const BOOTSTRAP_COEFFICIENTS: LogisticCoefficients = {
  intercept: -0.2,
  trigram: 1.4,
  phonetic: 0.9,
  classAdjacency: 1.0,
  goods: 0.5,
  crowdedness: -0.7,
};

export const BOOTSTRAP_MODEL = createLogisticScorer(BOOTSTRAP_COEFFICIENTS, BOOTSTRAP_MODEL_VERSION);
