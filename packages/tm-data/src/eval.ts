/**
 * Offline evaluation and calibration reporting (P5.4, mandates M6.1/M6.5, D-25).
 *
 * Scores are evaluated on a **temporally held-out split** (see `labels.ts`); the
 * report carries AUC, accuracy, the majority-class baseline, the accuracy lift
 * over that baseline, the 95% CI half-width on accuracy, and per-bucket
 * calibration. `evaluateRelease` encodes the D-25 promotion gate: ≥ 500 resolved
 * labels, CI half-width ≤ 5 pp, AUC ≥ threshold and lift ≥ threshold — all from
 * configuration.
 */

export interface EvalSample {
  /** P(registration) in `0..1`. */
  score: number;
  label: 0 | 1;
}

export interface CalibrationBucket {
  lo: number;
  hi: number;
  /** Mean predicted score in the bucket. */
  predicted: number;
  /** Mean observed outcome in the bucket. */
  observed: number;
  n: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Rank-based AUC (Mann–Whitney U) with average ranks for ties. Returns `0.5`
 * when either class is empty.
 */
export function auc(samples: readonly EvalSample[]): number {
  const positives = samples.filter((sample) => sample.label === 1);
  const negatives = samples.filter((sample) => sample.label === 0);
  if (positives.length === 0 || negatives.length === 0) return 0.5;

  const ranked = [...samples].sort((a, b) => a.score - b.score);
  const ranks = new Map<EvalSample, number>();
  let index = 0;
  while (index < ranked.length) {
    let end = index;
    while (end + 1 < ranked.length && ranked[end + 1]!.score === ranked[index]!.score) {
      end += 1;
    }
    const averageRank = (index + 1 + (end + 1)) / 2;
    for (let i = index; i <= end; i += 1) ranks.set(ranked[i]!, averageRank);
    index = end + 1;
  }

  const positiveRankSum = positives.reduce((sum, sample) => sum + (ranks.get(sample) ?? 0), 0);
  const nPos = positives.length;
  const nNeg = negatives.length;
  return (positiveRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/** Fraction of samples where `(score >= threshold)` matches the label. */
export function accuracyAtThreshold(samples: readonly EvalSample[], threshold: number): number {
  if (samples.length === 0) return 0;
  const correct = samples.filter((sample) => sample.score >= threshold === (sample.label === 1)).length;
  return correct / samples.length;
}

/** Majority-class rate; the naive baseline the model must beat (M5a: +10 pp). */
export function baselineAccuracy(samples: readonly EvalSample[]): number {
  if (samples.length === 0) return 0;
  const positives = samples.filter((sample) => sample.label === 1).length;
  const p = positives / samples.length;
  return Math.max(p, 1 - p);
}

/** 95% CI half-width on a proportion, in accuracy units (`0..1`). */
export function ciHalfWidth95(accuracy: number, n: number): number {
  if (n <= 0) return 0;
  return 1.96 * Math.sqrt((accuracy * (1 - accuracy)) / n);
}

/**
 * Equal-width calibration buckets over `[0,1]` (default 10 bins). Empty bins are
 * omitted; the remaining buckets carry mean predicted vs observed outcome.
 */
export function calibrationBuckets(samples: readonly EvalSample[], binCount = 10): CalibrationBucket[] {
  if (binCount <= 0 || samples.length === 0) return [];
  const buckets: Array<{ scores: number[]; labels: number[] }> = Array.from(
    { length: binCount },
    () => ({ scores: [], labels: [] }),
  );

  for (const sample of samples) {
    const clamped = Math.min(Math.max(sample.score, 0), 1);
    const bucketIndex = Math.min(Math.floor(clamped * binCount), binCount - 1);
    buckets[bucketIndex]!.scores.push(sample.score);
    buckets[bucketIndex]!.labels.push(sample.label);
  }

  const width = 1 / binCount;
  const result: CalibrationBucket[] = [];
  buckets.forEach((bucket, bucketIndex) => {
    if (bucket.scores.length === 0) return;
    result.push({
      lo: bucketIndex * width,
      hi: (bucketIndex + 1) * width,
      predicted: mean(bucket.scores),
      observed: mean(bucket.labels),
      n: bucket.scores.length,
    });
  });
  return result;
}

export interface CalibrationReport {
  sampleSize: number;
  auc: number;
  accuracy: number;
  baselineAccuracy: number;
  /** Accuracy minus baseline, in percentage points. */
  accuracyLiftPp: number;
  /** 95% CI half-width on accuracy, in percentage points. */
  ciHalfWidthPp: number;
  buckets: CalibrationBucket[];
}

/** Build the M6.5 calibration report for a scored, labelled sample set. */
export function buildCalibrationReport(samples: readonly EvalSample[], threshold = 0.5): CalibrationReport {
  const sampleSize = samples.length;
  const accuracy = accuracyAtThreshold(samples, threshold);
  const baseline = baselineAccuracy(samples);
  return {
    sampleSize,
    auc: auc(samples),
    accuracy,
    baselineAccuracy: baseline,
    accuracyLiftPp: (accuracy - baseline) * 100,
    ciHalfWidthPp: ciHalfWidth95(accuracy, sampleSize) * 100,
    buckets: calibrationBuckets(samples),
  };
}

export interface ReleaseThresholds {
  minResolvedLabels: number;
  maxCiHalfWidthPp: number;
  minAuc: number;
  minLiftPp: number;
}

/**
 * D-25 promotion gate. A model is releasable only when every configured
 * condition holds; `reasons` lists each failure (so a refusal is auditable).
 */
export function evaluateRelease(
  report: CalibrationReport,
  thresholds: ReleaseThresholds,
): { releasable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (report.sampleSize < thresholds.minResolvedLabels) {
    reasons.push(`sampleSize ${report.sampleSize} < minResolvedLabels ${thresholds.minResolvedLabels}`);
  }
  if (report.ciHalfWidthPp > thresholds.maxCiHalfWidthPp) {
    reasons.push(`ciHalfWidthPp ${report.ciHalfWidthPp} > maxCiHalfWidthPp ${thresholds.maxCiHalfWidthPp}`);
  }
  if (report.auc < thresholds.minAuc) {
    reasons.push(`auc ${report.auc} < minAuc ${thresholds.minAuc}`);
  }
  if (report.accuracyLiftPp < thresholds.minLiftPp) {
    reasons.push(`accuracyLiftPp ${report.accuracyLiftPp} < minLiftPp ${thresholds.minLiftPp}`);
  }
  return { releasable: reasons.length === 0, reasons };
}

/** D-25 / M5a defaults (kept in code only as a fallback; config wins at runtime). */
export const DEFAULT_RELEASE_THRESHOLDS: ReleaseThresholds = {
  minResolvedLabels: 500,
  maxCiHalfWidthPp: 5,
  minAuc: 0.7,
  minLiftPp: 10,
};
