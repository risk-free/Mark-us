/**
 * Offline eval thresholds (gate M5b).
 *
 * M5b is the release gate that pairs the P6 chatbot's retrieval quality with its
 * PII guard: a build is only shippable when retrieval recall/MRR/precision stay
 * above the floors below and the guard rejects every PII vector with zero
 * network calls. The floors are calibrated against the curated dataset in
 * `datasets.ts`; raise them as the KB improves, never lower them to make a
 * failing build pass.
 */

export interface EvalThresholds {
  /** Mean recall@5 over the retrieval dataset (all expected topics found). */
  retrievalRecallAt5: number;
  /** Mean reciprocal rank of the first expected topic. */
  retrievalMrr: number;
  /** Mean precision@3 (relevant topics in the top three). */
  retrievalPrecisionAt3: number;
  /** Share of PII vectors that must be rejected before any network call. */
  piiRejectionRate: number;
}

export const EVAL_THRESHOLDS: EvalThresholds = {
  retrievalRecallAt5: 0.85,
  retrievalMrr: 0.6,
  retrievalPrecisionAt3: 0.5,
  piiRejectionRate: 1,
};
