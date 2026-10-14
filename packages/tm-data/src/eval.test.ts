import {
  accuracyAtThreshold,
  auc,
  baselineAccuracy,
  buildCalibrationReport,
  calibrationBuckets,
  ciHalfWidth95,
  DEFAULT_RELEASE_THRESHOLDS,
  evaluateRelease,
  type EvalSample,
} from "./eval.js";

const samples = (pairs: Array<[number, 0 | 1]>): EvalSample[] => pairs.map(([score, label]) => ({ score, label }));

describe("auc", () => {
  test("is 1 for perfect separation", () => {
    expect(auc(samples([[0.1, 0], [0.2, 0], [0.8, 1], [0.9, 1]]))).toBe(1);
  });

  test("is 0 for perfectly inverted scores", () => {
    expect(auc(samples([[0.9, 0], [0.8, 0], [0.2, 1], [0.1, 1]]))).toBe(0);
  });

  test("handles ties with average ranks", () => {
    expect(auc(samples([[0.5, 0], [0.5, 1]]))).toBe(0.5);
  });

  test("is 0.5 when a class is empty", () => {
    expect(auc(samples([[0.5, 1], [0.6, 1]]))).toBe(0.5);
    expect(auc([])).toBe(0.5);
  });

  test("matches a hand-computed mixed case", () => {
    // positives {0.7, 0.4}, negatives {0.6, 0.2}: AUC = (2 + 1) / (2 * 2) = 0.75
    expect(auc(samples([[0.7, 1], [0.4, 1], [0.6, 0], [0.2, 0]]))).toBe(0.75);
  });
});

describe("accuracyAtThreshold", () => {
  test("counts score == threshold as a positive prediction", () => {
    const data = samples([[0.5, 1], [0.4, 0]]);
    expect(accuracyAtThreshold(data, 0.5)).toBe(1);
    expect(accuracyAtThreshold(data, 0.5001)).toBe(0.5);
  });

  test("is 0 for an empty set", () => {
    expect(accuracyAtThreshold([], 0.5)).toBe(0);
  });
});

describe("baselineAccuracy", () => {
  test("is the majority-class rate", () => {
    expect(baselineAccuracy(samples([[0.1, 1], [0.2, 1], [0.3, 0]]))).toBeCloseTo(2 / 3, 10);
    expect(baselineAccuracy([])).toBe(0);
  });
});

describe("ciHalfWidth95", () => {
  test("uses the normal approximation", () => {
    expect(ciHalfWidth95(0.9, 100)).toBeCloseTo(0.0588, 4);
    expect(ciHalfWidth95(0.5, 100)).toBeCloseTo(0.098, 3);
  });

  test("is 0 without samples", () => {
    expect(ciHalfWidth95(0.9, 0)).toBe(0);
  });
});

describe("calibrationBuckets", () => {
  test("groups by equal-width bins and reports predicted vs observed", () => {
    const buckets = calibrationBuckets(samples([[0.05, 0], [0.09, 0], [0.95, 1], [0.99, 1]]), 10);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.n).toBe(2);
    expect(buckets[0]!.observed).toBe(0);
    expect(buckets[1]!.n).toBe(2);
    expect(buckets[1]!.observed).toBe(1);
  });

  test("skips empty bins and handles no data", () => {
    expect(calibrationBuckets([], 10)).toEqual([]);
    expect(calibrationBuckets(samples([[1, 1]]), 10)).toHaveLength(1);
  });
});

describe("buildCalibrationReport", () => {
  test("computes accuracy, lift and CI half-width", () => {
    const report = buildCalibrationReport(samples([[0.9, 1], [0.8, 1], [0.2, 0], [0.1, 0]]));
    expect(report.sampleSize).toBe(4);
    expect(report.auc).toBe(1);
    expect(report.accuracy).toBe(1);
    expect(report.baselineAccuracy).toBe(0.5);
    expect(report.accuracyLiftPp).toBeCloseTo(50, 6);
    expect(report.ciHalfWidthPp).toBe(0);
  });
});

describe("evaluateRelease", () => {
  const passing = (): ReturnType<typeof buildCalibrationReport> =>
    buildCalibrationReport(
      Array.from({ length: 600 }, (_, i) => ({ score: i < 500 ? 0.9 : 0.1, label: (i < 500 ? 1 : 0) as 0 | 1 })),
    );

  test("passes when every D-25/M5a threshold is met", () => {
    expect(evaluateRelease(passing(), DEFAULT_RELEASE_THRESHOLDS)).toEqual({ releasable: true, reasons: [] });
  });

  test("fails with a reason for each unmet condition", () => {
    const report = { ...passing(), sampleSize: 100, ciHalfWidthPp: 9, auc: 0.6, accuracyLiftPp: 2 };
    const { releasable, reasons } = evaluateRelease(report, DEFAULT_RELEASE_THRESHOLDS);
    expect(releasable).toBe(false);
    expect(reasons).toHaveLength(4);
    expect(reasons.join(" ")).toContain("sampleSize");
    expect(reasons.join(" ")).toContain("ciHalfWidthPp");
    expect(reasons.join(" ")).toContain("auc");
    expect(reasons.join(" ")).toContain("accuracyLiftPp");
  });
});
