import type { FeatureVector } from "./features.js";
import type { ReleaseThresholds } from "./eval.js";
import {
  ArtifactScoringModel,
  InsufficientTrainingLabelsError,
  loadModelArtifact,
  ModelReleaseError,
  serializeModelArtifact,
  trainCorpusModel,
  type CorpusTrainingRow,
  type TrainCorpusModelOptions,
} from "./train.js";

const vector = (signal: number): FeatureVector => ({
  candidateCount: 2,
  maxTrigram: signal,
  meanTrigram: signal,
  maxPhonetic: signal,
  minClassDistance: signal >= 0.5 ? 0 : 2,
  goodsMax: signal,
});

const outcomeDate = (filingDate: Date): Date =>
  new Date(Date.UTC(filingDate.getUTCFullYear(), filingDate.getUTCMonth() + 6, filingDate.getUTCDate()));

const trainingRow = (
  serialNumber: string,
  filingDate: Date,
  signal: number,
  outcome: "positive" | "negative" | "censored",
): CorpusTrainingRow => ({
  serialNumber,
  filingDate,
  registrationDate: outcome === "positive" ? outcomeDate(filingDate) : null,
  abandonDate: outcome === "negative" ? outcomeDate(filingDate) : null,
  statusCode: outcome === "positive" ? "700" : "600",
  features: vector(signal),
});

const fixture = (): CorpusTrainingRow[] => {
  const rows: CorpusTrainingRow[] = [];
  for (let index = 0; index < 12; index += 1) {
    const trainFiling = new Date(Date.UTC(2019, index, 1));
    const holdoutFiling = new Date(Date.UTC(2020, index, 1));
    const positive = index % 2 === 0;
    rows.push(
      trainingRow(`train-${index}`, trainFiling, positive ? 0.9 : 0.1, positive ? "positive" : "negative"),
      trainingRow(`holdout-${index}`, holdoutFiling, positive ? 0.85 : 0.15, positive ? "positive" : "negative"),
    );
  }
  return rows;
};

const thresholds: ReleaseThresholds = {
  minResolvedLabels: 4,
  maxCiHalfWidthPp: 100,
  minAuc: 0.8,
  minLiftPp: 10,
};

const options = (overrides: Partial<TrainCorpusModelOptions> = {}): TrainCorpusModelOptions => ({
  modelVersion: "fixture-logistic-1",
  trainingCutoff: new Date("2020-01-01T00:00:00.000Z"),
  censusAt: new Date("2022-01-01T00:00:00.000Z"),
  horizonMonths: 12,
  releaseThresholds: thresholds,
  ...overrides,
});

describe("trainCorpusModel", () => {
  test("fits deterministically regardless of input order", () => {
    const first = trainCorpusModel(fixture(), options());
    const second = trainCorpusModel([...fixture()].reverse(), options());

    expect(second).toEqual(first);
    expect(serializeModelArtifact(second)).toBe(serializeModelArtifact(first));
    expect(first.trainer.converged).toBe(true);
    expect(first.trainer.iterations).toBeLessThanOrEqual(first.trainer.maxIterations);
    expect(first.trainer.l2Regularization).toBeGreaterThan(0);
  });

  test("enforces the temporal split before scaling and fitting", () => {
    const baseline = trainCorpusModel(fixture(), options());
    const changedHoldout = fixture().map((row) =>
      row.filingDate >= options().trainingCutoff ? { ...row, features: vector(0.5) } : row,
    );
    const result = trainCorpusModel(changedHoldout, options({
      releaseThresholds: { ...thresholds, minAuc: 0, minLiftPp: -100 },
    }));

    expect(result.coefficients).toEqual(baseline.coefficients);
    expect(result.scaling).toEqual(baseline.scaling);
    expect(result.labelCounts.train).toEqual({ positive: 6, negative: 6 });
    expect(result.labelCounts.holdout).toEqual({ positive: 6, negative: 6 });
  });

  test("excludes censored rows from fitting rather than treating pending as negative", () => {
    const baseline = trainCorpusModel(fixture(), options());
    const censored = Array.from({ length: 20 }, (_, index) =>
      trainingRow(`pending-${index}`, new Date(Date.UTC(2019, 0, index + 2)), 1, "censored"),
    );
    const result = trainCorpusModel([...fixture(), ...censored], options());

    expect(result.coefficients).toEqual(baseline.coefficients);
    expect(result.scaling).toEqual(baseline.scaling);
    expect(result.labelCounts.censored).toBe(20);
    expect(result.labelCounts.train).toEqual(baseline.labelCounts.train);
  });

  test("reports holdout AUC, accuracy lift, CI and calibration through the release gate", () => {
    const artifact = trainCorpusModel(fixture(), options());

    expect(artifact.evalReport.sampleSize).toBe(12);
    expect(artifact.evalReport.auc).toBe(1);
    expect(artifact.evalReport.accuracyLiftPp).toBeCloseTo(50, 8);
    expect(artifact.evalReport.ciHalfWidthPp).toBe(0);
    expect(artifact.evalReport.buckets.length).toBeGreaterThan(0);
    expect(artifact.releaseGate).toEqual({ releasable: true, reasons: [], thresholds });
    expect(artifact.trainingCutoff).toBe("2020-01-01T00:00:00.000Z");
    expect(artifact.featureOrder).toEqual(["trigram", "phonetic", "classAdjacency", "goods", "crowdedness"]);
  });

  test("round-trips a versioned JSON artifact into a ScoringModel", () => {
    const artifact = trainCorpusModel(fixture(), options());
    const model = loadModelArtifact(serializeModelArtifact(artifact));
    const direct = new ArtifactScoringModel(artifact);

    expect(model).toBeInstanceOf(ArtifactScoringModel);
    expect(model.version).toBe("fixture-logistic-1");
    expect(model.score(vector(0.9))).toBe(direct.score(vector(0.9)));
    expect(model.score(vector(0.9))).toBeGreaterThan(model.score(vector(0.1)));
    expect(serializeModelArtifact(model.artifact)).toBe(serializeModelArtifact(artifact));
  });

  test("rejects a failed release threshold explicitly", () => {
    let caught: unknown;
    try {
      trainCorpusModel(fixture(), options({
        releaseThresholds: { ...thresholds, minResolvedLabels: 500 },
      }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ModelReleaseError);
    expect((caught as ModelReleaseError).reasons.join(" ")).toContain("sampleSize 12 < minResolvedLabels 500");
    expect((caught as ModelReleaseError).evalReport.sampleSize).toBe(12);
  });

  test("rejects insufficient training labels before fitting", () => {
    const positivesOnly = fixture().filter((row) => row.registrationDate !== null);
    expect(() => trainCorpusModel(positivesOnly, options())).toThrow(InsufficientTrainingLabelsError);
    expect(() => trainCorpusModel([], options())).toThrow(/positive and negative resolved labels/);
  });

  test("rejects an empty holdout even when configurable thresholds would allow it", () => {
    const trainOnly = fixture().filter((row) => row.filingDate < options().trainingCutoff);
    const relaxed = { minResolvedLabels: 0, maxCiHalfWidthPp: 100, minAuc: 0, minLiftPp: -100 };

    expect(() => trainCorpusModel(trainOnly, options({ releaseThresholds: relaxed }))).toThrow(
      /temporal holdout split requires positive and negative resolved labels/,
    );
  });

  test("rejects a single-class holdout before reporting a misleading AUC", () => {
    const rows = fixture().filter(
      (row) => row.filingDate < options().trainingCutoff || row.registrationDate !== null,
    );
    const relaxed = { minResolvedLabels: 0, maxCiHalfWidthPp: 100, minAuc: 0, minLiftPp: -100 };

    expect(() => trainCorpusModel(rows, options({ releaseThresholds: relaxed }))).toThrow(
      /got 6 positive and 0 negative/,
    );
  });

  test("rejects an incoherent cutoff and census before label assembly", () => {
    const censusAt = options().trainingCutoff;
    expect(() => trainCorpusModel(fixture(), options({ censusAt }))).toThrow(
      /trainingCutoff must be earlier than censusAt/,
    );
  });

  test("rejects an artifact with an incompatible feature order", () => {
    const artifact = trainCorpusModel(fixture(), options());
    const malformed = { ...artifact, featureOrder: [...artifact.featureOrder].reverse() };
    expect(() => loadModelArtifact(JSON.stringify(malformed))).toThrow(/unsupported featureOrder/);
  });

  test("rejects malformed or internally inconsistent artifact metadata", () => {
    const artifact = trainCorpusModel(fixture(), options());
    const malformed: Array<[unknown, RegExp]> = [
      [{ ...artifact, labelHorizonMonths: 0 }, /labelHorizonMonths must be positive/],
      [{ ...artifact, trainingCutoff: "01/01/2020" }, /canonical ISO timestamp/],
      [{ ...artifact, trainer: { converged: true } }, /unsupported trainer algorithm/],
      [{ ...artifact, releaseGate: { releasable: false } }, /only a releasable artifact/],
      [
        { ...artifact, evalReport: { ...artifact.evalReport, sampleSize: 11 } },
        /sampleSize does not match holdout label counts/,
      ],
      [
        { ...artifact, evalReport: { ...artifact.evalReport, buckets: [{}] } },
        /evalReport\.buckets\[0\]\.lo must be a finite number/,
      ],
      [
        {
          ...artifact,
          releaseGate: {
            ...artifact.releaseGate,
            thresholds: { ...artifact.releaseGate.thresholds, minLiftPp: 100 },
          },
        },
        /releaseGate is inconsistent/,
      ],
    ];

    for (const [candidate, error] of malformed) {
      expect(() => loadModelArtifact(JSON.stringify(candidate))).toThrow(error);
    }
  });
});
