/**
 * Deterministic offline logistic trainer and versioned model artifact (P5.4).
 *
 * Only the existing FeatureVector is used. The temporal split and D-24/D-26
 * label assembly happen before train-only scaling or fitting. Holdout metrics
 * are computed with the existing calibration helpers and must pass
 * `evaluateRelease`; this module never activates a model in production.
 */

import {
  buildCalibrationReport,
  evaluateRelease,
  DEFAULT_RELEASE_THRESHOLDS,
  type CalibrationReport,
  type EvalSample,
  type ReleaseThresholds,
} from "./eval.js";
import type { FeatureVector } from "./features.js";
import { assembleLabelSet, temporalSplit, type OutcomeRow } from "./labels.js";
import {
  LOGISTIC_FEATURE_ORDER,
  toLogisticScalars,
  type LogisticCoefficients,
  type LogisticFeatureName,
  type ScoringModel,
} from "./model.js";

export const MODEL_ARTIFACT_SCHEMA_VERSION = 1;
export const LOGISTIC_L2_REGULARIZATION = 0.01;
export const LOGISTIC_MAX_ITERATIONS = 100;
export const LOGISTIC_CONVERGENCE_TOLERANCE = 1e-9;
export const DEFAULT_LABEL_HORIZON_MONTHS = 12;

const PARAMETER_COUNT = LOGISTIC_FEATURE_ORDER.length + 1;

export interface CorpusTrainingRow extends OutcomeRow {
  features: FeatureVector;
}

export interface SplitLabelCounts {
  positive: number;
  negative: number;
}

export interface ModelArtifact {
  schemaVersion: typeof MODEL_ARTIFACT_SCHEMA_VERSION;
  modelVersion: string;
  featureOrder: LogisticFeatureName[];
  /** Train-split population statistics, aligned with featureOrder. */
  scaling: { mean: number[]; scale: number[] };
  /** Coefficients apply after scaling, with an unregularised intercept. */
  coefficients: LogisticCoefficients;
  trainingCutoff: string;
  censusAt: string;
  labelHorizonMonths: number;
  labelCounts: {
    train: SplitLabelCounts;
    holdout: SplitLabelCounts;
    censored: number;
  };
  trainer: {
    algorithm: "batch-newton";
    l2Regularization: number;
    tolerance: number;
    maxIterations: number;
    iterations: number;
    converged: true;
  };
  evalReport: CalibrationReport;
  releaseGate: {
    releasable: boolean;
    reasons: string[];
    thresholds: ReleaseThresholds;
  };
}

export interface TrainCorpusModelOptions {
  modelVersion: string;
  trainingCutoff: Date;
  censusAt: Date;
  horizonMonths?: number;
  releaseThresholds?: ReleaseThresholds;
}

export class InsufficientTrainingLabelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientTrainingLabelsError";
  }
}

export class TrainingConvergenceError extends Error {
  constructor(iterations: number) {
    super(`logistic trainer did not converge within ${iterations} iterations`);
    this.name = "TrainingConvergenceError";
  }
}

export class ModelReleaseError extends Error {
  readonly evalReport: CalibrationReport;
  readonly reasons: string[];

  constructor(evalReport: CalibrationReport, reasons: string[]) {
    super(`model release gate failed: ${reasons.join("; ")}`);
    this.name = "ModelReleaseError";
    this.evalReport = evalReport;
    this.reasons = reasons;
  }
}

interface LabeledRow {
  row: CorpusTrainingRow;
  label: 0 | 1;
}

interface FittedParameters {
  coefficients: LogisticCoefficients;
  scaling: ModelArtifact["scaling"];
  iterations: number;
}

const sigmoid = (value: number): number => {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
};

const validDate = (date: Date, name: string): void => {
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be a valid date`);
};

const countLabels = (rows: readonly LabeledRow[]): SplitLabelCounts => ({
  positive: rows.filter((entry) => entry.label === 1).length,
  negative: rows.filter((entry) => entry.label === 0).length,
});

/** Deterministic Gauss-Jordan solve with partial pivoting for the 6x6 Newton system. */
const solve = (matrix: readonly (readonly number[])[], vector: readonly number[]): number[] => {
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);

  for (let column = 0; column < PARAMETER_COUNT; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < PARAMETER_COUNT; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivotRow]![column]!)) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow]![column]!) < 1e-12) {
      throw new TrainingConvergenceError(LOGISTIC_MAX_ITERATIONS);
    }
    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[column]!];

    const pivot = augmented[column]![column]!;
    for (let entry = column; entry <= PARAMETER_COUNT; entry += 1) {
      augmented[column]![entry]! /= pivot;
    }
    for (let row = 0; row < PARAMETER_COUNT; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let entry = column; entry <= PARAMETER_COUNT; entry += 1) {
        augmented[row]![entry]! -= factor * augmented[column]![entry]!;
      }
    }
  }

  return augmented.map((row) => row[PARAMETER_COUNT]!);
};

const coefficientsFrom = (weights: readonly number[]): LogisticCoefficients => {
  const coefficients = { intercept: weights[0]! } as LogisticCoefficients;
  LOGISTIC_FEATURE_ORDER.forEach((feature, index) => {
    coefficients[feature] = weights[index + 1]!;
  });
  return coefficients;
};

const scoreWithParameters = (
  features: FeatureVector,
  coefficients: LogisticCoefficients,
  scaling: ModelArtifact["scaling"],
): number => {
  const scalars = toLogisticScalars(features);
  const linear = LOGISTIC_FEATURE_ORDER.reduce((sum, feature, index) => {
    const standardized = (scalars[feature] - scaling.mean[index]!) / scaling.scale[index]!;
    return sum + coefficients[feature] * standardized;
  }, coefficients.intercept);
  return sigmoid(linear);
};

/** Fit only the supplied temporal training split; scaling never sees holdout rows. */
const fit = (rows: readonly LabeledRow[]): FittedParameters => {
  const scalarRows = rows.map(({ row }) => toLogisticScalars(row.features));
  for (const scalars of scalarRows) {
    for (const feature of LOGISTIC_FEATURE_ORDER) {
      if (!Number.isFinite(scalars[feature])) {
        throw new Error(`training feature ${feature} must be finite`);
      }
    }
  }

  const mean = LOGISTIC_FEATURE_ORDER.map(
    (feature) => scalarRows.reduce((sum, scalars) => sum + scalars[feature], 0) / rows.length,
  );
  const scale = LOGISTIC_FEATURE_ORDER.map((feature, featureIndex) => {
    const variance =
      scalarRows.reduce((sum, scalars) => {
        const delta = scalars[feature] - mean[featureIndex]!;
        return sum + delta * delta;
      }, 0) / rows.length;
    const standardDeviation = Math.sqrt(variance);
    return standardDeviation < 1e-12 ? 1 : standardDeviation;
  });
  const vectors = scalarRows.map((scalars) => [
    1,
    ...LOGISTIC_FEATURE_ORDER.map(
      (feature, index) => (scalars[feature] - mean[index]!) / scale[index]!,
    ),
  ]);

  let weights = Array<number>(PARAMETER_COUNT).fill(0);
  for (let iteration = 1; iteration <= LOGISTIC_MAX_ITERATIONS; iteration += 1) {
    const gradient = Array<number>(PARAMETER_COUNT).fill(0);
    const hessian = Array.from({ length: PARAMETER_COUNT }, () =>
      Array<number>(PARAMETER_COUNT).fill(0),
    );

    rows.forEach((entry, rowIndex) => {
      const vector = vectors[rowIndex]!;
      const prediction = sigmoid(vector.reduce((sum, value, index) => sum + value * weights[index]!, 0));
      const residual = prediction - entry.label;
      const variance = Math.max(prediction * (1 - prediction), 1e-12);

      for (let left = 0; left < PARAMETER_COUNT; left += 1) {
        gradient[left]! += residual * vector[left]!;
        for (let right = 0; right <= left; right += 1) {
          hessian[left]![right]! += variance * vector[left]! * vector[right]!;
        }
      }
    });

    for (let left = 0; left < PARAMETER_COUNT; left += 1) {
      gradient[left]! /= rows.length;
      if (left > 0) gradient[left]! += LOGISTIC_L2_REGULARIZATION * weights[left]!;
      for (let right = 0; right <= left; right += 1) {
        hessian[left]![right]! /= rows.length;
        if (left !== right) hessian[right]![left] = hessian[left]![right]!;
      }
      if (left > 0) hessian[left]![left]! += LOGISTIC_L2_REGULARIZATION;
    }

    const delta = solve(hessian, gradient);
    const next = weights.map((weight, index) => weight - delta[index]!);
    if (next.some((weight) => !Number.isFinite(weight))) {
      throw new TrainingConvergenceError(iteration);
    }
    const largestStep = Math.max(...delta.map((value) => Math.abs(value)));
    weights = next;
    if (largestStep <= LOGISTIC_CONVERGENCE_TOLERANCE) {
      return { coefficients: coefficientsFrom(weights), scaling: { mean, scale }, iterations: iteration };
    }
  }

  throw new TrainingConvergenceError(LOGISTIC_MAX_ITERATIONS);
};

/**
 * Assemble D-24/D-26 labels, split by filing date, fit on train only, and
 * evaluate on holdout. A failed gate throws and returns no artifact.
 */
export function trainCorpusModel(
  rows: readonly CorpusTrainingRow[],
  options: TrainCorpusModelOptions,
): ModelArtifact {
  if (options.modelVersion.trim().length === 0) throw new Error("modelVersion must not be empty");
  validDate(options.trainingCutoff, "trainingCutoff");
  validDate(options.censusAt, "censusAt");
  if (options.trainingCutoff.getTime() >= options.censusAt.getTime()) {
    throw new Error("trainingCutoff must be earlier than censusAt");
  }
  const horizonMonths = options.horizonMonths ?? DEFAULT_LABEL_HORIZON_MONTHS;
  if (!Number.isInteger(horizonMonths) || horizonMonths <= 0) {
    throw new Error("horizonMonths must be a positive integer");
  }

  const assembled = assembleLabelSet(rows, options.censusAt, horizonMonths);
  const labeled: LabeledRow[] = assembled.labeled
    .map(({ row, label }): LabeledRow => ({ row, label: label === "positive" ? 1 : 0 }))
    .sort(
      (left, right) =>
        left.row.filingDate.getTime() - right.row.filingDate.getTime() ||
        left.row.serialNumber.localeCompare(right.row.serialNumber),
    );
  const split = temporalSplit(labeled, options.trainingCutoff, (entry) => entry.row.filingDate);
  const trainCounts = countLabels(split.train);
  const holdoutCounts = countLabels(split.holdout);
  if (trainCounts.positive === 0 || trainCounts.negative === 0) {
    throw new InsufficientTrainingLabelsError(
      `temporal training split requires positive and negative resolved labels; got ${trainCounts.positive} positive and ${trainCounts.negative} negative`,
    );
  }
  if (holdoutCounts.positive === 0 || holdoutCounts.negative === 0) {
    throw new InsufficientTrainingLabelsError(
      `temporal holdout split requires positive and negative resolved labels; got ${holdoutCounts.positive} positive and ${holdoutCounts.negative} negative`,
    );
  }

  const fitted = fit(split.train);
  const holdoutSamples: EvalSample[] = split.holdout.map((entry) => ({
    score: scoreWithParameters(entry.row.features, fitted.coefficients, fitted.scaling),
    label: entry.label,
  }));
  const evalReport = buildCalibrationReport(holdoutSamples);
  const thresholds = options.releaseThresholds ?? DEFAULT_RELEASE_THRESHOLDS;
  const releaseGate = evaluateRelease(evalReport, thresholds);
  if (!releaseGate.releasable) throw new ModelReleaseError(evalReport, releaseGate.reasons);

  return {
    schemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
    modelVersion: options.modelVersion,
    featureOrder: [...LOGISTIC_FEATURE_ORDER],
    scaling: fitted.scaling,
    coefficients: fitted.coefficients,
    trainingCutoff: options.trainingCutoff.toISOString(),
    censusAt: options.censusAt.toISOString(),
    labelHorizonMonths: horizonMonths,
    labelCounts: { train: trainCounts, holdout: holdoutCounts, censored: assembled.censored },
    trainer: {
      algorithm: "batch-newton",
      l2Regularization: LOGISTIC_L2_REGULARIZATION,
      tolerance: LOGISTIC_CONVERGENCE_TOLERANCE,
      maxIterations: LOGISTIC_MAX_ITERATIONS,
      iterations: fitted.iterations,
      converged: true,
    },
    evalReport,
    releaseGate: { ...releaseGate, thresholds },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireFinite = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid model artifact: ${path} must be a finite number`);
  }
  return value;
};

const requireCount = (value: unknown, path: string): number => {
  const count = requireFinite(value, path);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`invalid model artifact: ${path} must be a non-negative integer`);
  }
  return count;
};

const requireUnitInterval = (value: unknown, path: string): number => {
  const number = requireFinite(value, path);
  if (number < 0 || number > 1) {
    throw new Error(`invalid model artifact: ${path} must be in 0..1`);
  }
  return number;
};

const requireIsoTimestamp = (value: unknown, path: string): string => {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`invalid model artifact: ${path} must be a canonical ISO timestamp`);
  }
  return value;
};

const validateSplitCounts = (value: unknown, path: string): SplitLabelCounts => {
  if (!isRecord(value)) throw new Error(`invalid model artifact: ${path} must be an object`);
  return {
    positive: requireCount(value.positive, `${path}.positive`),
    negative: requireCount(value.negative, `${path}.negative`),
  };
};

const validateThresholds = (value: unknown): ReleaseThresholds => {
  if (!isRecord(value)) throw new Error("invalid model artifact: releaseGate.thresholds must be an object");
  const maxCiHalfWidthPp = requireFinite(
    value.maxCiHalfWidthPp,
    "releaseGate.thresholds.maxCiHalfWidthPp",
  );
  if (maxCiHalfWidthPp < 0) {
    throw new Error("invalid model artifact: releaseGate.thresholds.maxCiHalfWidthPp must not be negative");
  }
  return {
    minResolvedLabels: requireCount(
      value.minResolvedLabels,
      "releaseGate.thresholds.minResolvedLabels",
    ),
    maxCiHalfWidthPp,
    minAuc: requireUnitInterval(value.minAuc, "releaseGate.thresholds.minAuc"),
    minLiftPp: requireFinite(value.minLiftPp, "releaseGate.thresholds.minLiftPp"),
  };
};

const validateArtifact = (value: unknown): ModelArtifact => {
  if (!isRecord(value)) throw new Error("invalid model artifact: expected an object");
  if (value.schemaVersion !== MODEL_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(`invalid model artifact: unsupported schemaVersion ${String(value.schemaVersion)}`);
  }
  if (typeof value.modelVersion !== "string" || value.modelVersion.trim().length === 0) {
    throw new Error("invalid model artifact: modelVersion must not be empty");
  }
  if (
    !Array.isArray(value.featureOrder) ||
    value.featureOrder.length !== LOGISTIC_FEATURE_ORDER.length ||
    value.featureOrder.some((feature, index) => feature !== LOGISTIC_FEATURE_ORDER[index])
  ) {
    throw new Error("invalid model artifact: unsupported featureOrder");
  }

  const scaling = value.scaling;
  if (!isRecord(scaling)) throw new Error("invalid model artifact: scaling must be an object");
  if (!Array.isArray(scaling.mean) || !Array.isArray(scaling.scale)) {
    throw new Error("invalid model artifact: scaling arrays are required");
  }
  if (
    scaling.mean.length !== LOGISTIC_FEATURE_ORDER.length ||
    scaling.scale.length !== LOGISTIC_FEATURE_ORDER.length
  ) {
    throw new Error("invalid model artifact: scaling does not match featureOrder");
  }
  const mean = scaling.mean.map((entry, index) => requireFinite(entry, `scaling.mean[${index}]`));
  const scale = scaling.scale.map((entry, index) => {
    const number = requireFinite(entry, `scaling.scale[${index}]`);
    if (number <= 0) throw new Error(`invalid model artifact: scaling.scale[${index}] must be positive`);
    return number;
  });

  const rawCoefficients = value.coefficients;
  if (!isRecord(rawCoefficients)) throw new Error("invalid model artifact: coefficients must be an object");
  const coefficients = {
    intercept: requireFinite(rawCoefficients.intercept, "coefficients.intercept"),
  } as LogisticCoefficients;
  for (const feature of LOGISTIC_FEATURE_ORDER) {
    coefficients[feature] = requireFinite(rawCoefficients[feature], `coefficients.${feature}`);
  }

  const trainingCutoff = requireIsoTimestamp(value.trainingCutoff, "trainingCutoff");
  const censusAt = requireIsoTimestamp(value.censusAt, "censusAt");
  if (Date.parse(trainingCutoff) >= Date.parse(censusAt)) {
    throw new Error("invalid model artifact: trainingCutoff must be earlier than censusAt");
  }
  const labelHorizonMonths = requireCount(value.labelHorizonMonths, "labelHorizonMonths");
  if (labelHorizonMonths === 0) {
    throw new Error("invalid model artifact: labelHorizonMonths must be positive");
  }

  const rawLabelCounts = value.labelCounts;
  if (!isRecord(rawLabelCounts)) throw new Error("invalid model artifact: labelCounts must be an object");
  const train = validateSplitCounts(rawLabelCounts.train, "labelCounts.train");
  const holdout = validateSplitCounts(rawLabelCounts.holdout, "labelCounts.holdout");
  const censored = requireCount(rawLabelCounts.censored, "labelCounts.censored");
  if (train.positive === 0 || train.negative === 0 || holdout.positive === 0 || holdout.negative === 0) {
    throw new Error("invalid model artifact: train and holdout must both contain both label classes");
  }

  const rawReport = value.evalReport;
  if (!isRecord(rawReport)) throw new Error("invalid model artifact: evalReport must be an object");
  const sampleSize = requireCount(rawReport.sampleSize, "evalReport.sampleSize");
  if (sampleSize !== holdout.positive + holdout.negative) {
    throw new Error("invalid model artifact: evalReport.sampleSize does not match holdout label counts");
  }
  const ciHalfWidthPp = requireFinite(rawReport.ciHalfWidthPp, "evalReport.ciHalfWidthPp");
  if (ciHalfWidthPp < 0) throw new Error("invalid model artifact: evalReport.ciHalfWidthPp must not be negative");
  if (!Array.isArray(rawReport.buckets)) {
    throw new Error("invalid model artifact: evalReport.buckets must be an array");
  }
  const buckets = rawReport.buckets.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`invalid model artifact: evalReport.buckets[${index}] must be an object`);
    const lo = requireUnitInterval(entry.lo, `evalReport.buckets[${index}].lo`);
    const hi = requireUnitInterval(entry.hi, `evalReport.buckets[${index}].hi`);
    if (hi <= lo) throw new Error(`invalid model artifact: evalReport.buckets[${index}] has an empty range`);
    const n = requireCount(entry.n, `evalReport.buckets[${index}].n`);
    if (n === 0) throw new Error(`invalid model artifact: evalReport.buckets[${index}].n must be positive`);
    return {
      lo,
      hi,
      predicted: requireUnitInterval(entry.predicted, `evalReport.buckets[${index}].predicted`),
      observed: requireUnitInterval(entry.observed, `evalReport.buckets[${index}].observed`),
      n,
    };
  });
  if (buckets.reduce((sum, bucket) => sum + bucket.n, 0) !== sampleSize) {
    throw new Error("invalid model artifact: calibration bucket counts do not match evalReport.sampleSize");
  }
  const evalReport: CalibrationReport = {
    sampleSize,
    auc: requireUnitInterval(rawReport.auc, "evalReport.auc"),
    accuracy: requireUnitInterval(rawReport.accuracy, "evalReport.accuracy"),
    baselineAccuracy: requireUnitInterval(rawReport.baselineAccuracy, "evalReport.baselineAccuracy"),
    accuracyLiftPp: requireFinite(rawReport.accuracyLiftPp, "evalReport.accuracyLiftPp"),
    ciHalfWidthPp,
    buckets,
  };

  const rawTrainer = value.trainer;
  if (!isRecord(rawTrainer) || rawTrainer.converged !== true) {
    throw new Error("invalid model artifact: trainer convergence is not recorded");
  }
  if (rawTrainer.algorithm !== "batch-newton") {
    throw new Error("invalid model artifact: unsupported trainer algorithm");
  }
  const l2Regularization = requireFinite(rawTrainer.l2Regularization, "trainer.l2Regularization");
  const tolerance = requireFinite(rawTrainer.tolerance, "trainer.tolerance");
  const maxIterations = requireCount(rawTrainer.maxIterations, "trainer.maxIterations");
  if (
    l2Regularization !== LOGISTIC_L2_REGULARIZATION ||
    tolerance !== LOGISTIC_CONVERGENCE_TOLERANCE ||
    maxIterations !== LOGISTIC_MAX_ITERATIONS
  ) {
    throw new Error("invalid model artifact: trainer settings do not match schema v1");
  }
  const iterations = requireCount(rawTrainer.iterations, "trainer.iterations");
  if (iterations === 0 || iterations > maxIterations) {
    throw new Error("invalid model artifact: trainer.iterations is outside the recorded iteration limit");
  }

  const rawReleaseGate = value.releaseGate;
  if (!isRecord(rawReleaseGate) || rawReleaseGate.releasable !== true) {
    throw new Error("invalid model artifact: only a releasable artifact can be loaded");
  }
  if (
    !Array.isArray(rawReleaseGate.reasons) ||
    rawReleaseGate.reasons.some((reason) => typeof reason !== "string")
  ) {
    throw new Error("invalid model artifact: releaseGate.reasons must be a string array");
  }
  const reasons = rawReleaseGate.reasons as string[];
  const thresholds = validateThresholds(rawReleaseGate.thresholds);
  const expectedGate = evaluateRelease(evalReport, thresholds);
  if (
    !expectedGate.releasable ||
    reasons.length !== expectedGate.reasons.length ||
    reasons.some((reason, index) => reason !== expectedGate.reasons[index])
  ) {
    throw new Error("invalid model artifact: releaseGate is inconsistent with evalReport and thresholds");
  }

  return {
    schemaVersion: MODEL_ARTIFACT_SCHEMA_VERSION,
    modelVersion: value.modelVersion,
    featureOrder: [...LOGISTIC_FEATURE_ORDER],
    scaling: { mean, scale },
    coefficients,
    trainingCutoff,
    censusAt,
    labelHorizonMonths,
    labelCounts: { train, holdout, censored },
    trainer: {
      algorithm: "batch-newton",
      l2Regularization,
      tolerance,
      maxIterations,
      iterations,
      converged: true,
    },
    evalReport,
    releaseGate: { releasable: true, reasons, thresholds },
  };
};

export function serializeModelArtifact(artifact: ModelArtifact): string {
  return `${JSON.stringify(validateArtifact(artifact), null, 2)}\n`;
}

/** A trained, scaled logistic model loaded from an artifact. */
export class ArtifactScoringModel implements ScoringModel {
  readonly version: string;
  readonly artifact: ModelArtifact;

  constructor(artifact: ModelArtifact) {
    this.artifact = artifact;
    this.version = artifact.modelVersion;
  }

  score(features: FeatureVector): number {
    return scoreWithParameters(features, this.artifact.coefficients, this.artifact.scaling);
  }
}

/** Parse, validate and load a JSON artifact without changing production wiring. */
export function loadModelArtifact(serialized: string): ArtifactScoringModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new Error(`invalid model artifact JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new ArtifactScoringModel(validateArtifact(parsed));
}
