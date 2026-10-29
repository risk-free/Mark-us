/**
 * Bounded, deterministic corpus-selection configuration for offline training.
 * This module is dependency-free so CLI, source, and artifact validation share
 * exactly the same rules.
 */

export const DEFAULT_TRAINING_BATCH_SIZE = 500;
export const MAX_TRAINING_BATCH_SIZE = 5_000;
export const DEFAULT_TRAINING_MAX_EXAMPLES = 50_000;
export const DEFAULT_TRAINING_COHORT = "live-v1";
export const DEFAULT_TRAINING_SEED = 0;
export const TRAINING_SAMPLING_ALGORITHM = "hash-top-n-v1" as const;
export const CURRENT_CORPUS_RECONSTRUCTION_LIMITATION = "current-corpus-not-point-in-time" as const;

const COHORT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface TrainingCorpusConfig {
  /** Logical name recorded with the deterministic live-corpus selection. */
  cohort: string;
  /** Unsigned 32-bit seed used by the stable serial-number hash. */
  seed: number;
  /** Maximum outcome rows buffered by one keyset page. */
  batchSize: number;
  /** Maximum globally hash-sampled examples retained for labeling/training. */
  maxExamples: number;
}

export interface TrainingCorpusArtifactMetadata extends TrainingCorpusConfig {
  samplingAlgorithm: typeof TRAINING_SAMPLING_ALGORITHM;
  /** Actual number of streamed examples, including censored rows. */
  sampleSize: number;
  historicalReconstruction: typeof CURRENT_CORPUS_RECONSTRUCTION_LIMITATION;
}

export const DEFAULT_TRAINING_CORPUS_CONFIG: Readonly<TrainingCorpusConfig> = Object.freeze({
  cohort: DEFAULT_TRAINING_COHORT,
  seed: DEFAULT_TRAINING_SEED,
  batchSize: DEFAULT_TRAINING_BATCH_SIZE,
  maxExamples: DEFAULT_TRAINING_MAX_EXAMPLES,
});

export function validateTrainingCorpusConfig(config: TrainingCorpusConfig): void {
  if (!COHORT_PATTERN.test(config.cohort)) {
    throw new Error("cohort must be 1-64 characters using letters, digits, '.', '_' or '-'");
  }
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffff_ffff) {
    throw new Error("seed must be an unsigned 32-bit integer");
  }
  if (
    !Number.isInteger(config.batchSize) ||
    config.batchSize <= 0 ||
    config.batchSize > MAX_TRAINING_BATCH_SIZE
  ) {
    throw new Error(`batchSize must be an integer in 1..${MAX_TRAINING_BATCH_SIZE}`);
  }
  if (!Number.isSafeInteger(config.maxExamples) || config.maxExamples <= 0) {
    throw new Error("maxExamples must be a positive safe integer");
  }
}

/**
 * Stable 53-bit hash (cyrb53) used as a sampling rank. The lowest ranks are
 * selected, with serial number as the deterministic tie-breaker. No locale,
 * random state, database hash version, or pagination order affects selection.
 */
export function trainingSampleRank(serialNumber: string, seed: number): number {
  let left = (0xdeadbeef ^ seed) >>> 0;
  let right = (0x41c6ce57 ^ seed) >>> 0;
  for (let index = 0; index < serialNumber.length; index += 1) {
    const code = serialNumber.charCodeAt(index);
    left = Math.imul(left ^ code, 2_654_435_761);
    right = Math.imul(right ^ code, 1_597_334_677);
  }
  left = Math.imul(left ^ (left >>> 16), 2_246_822_507) ^ Math.imul(right ^ (right >>> 13), 3_266_489_909);
  right = Math.imul(right ^ (right >>> 16), 2_246_822_507) ^ Math.imul(left ^ (left >>> 13), 3_266_489_909);
  return 4_294_967_296 * (2_097_151 & right) + (left >>> 0);
}
