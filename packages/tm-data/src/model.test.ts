import type { FeatureVector } from "./features.js";
import {
  BASE_RATE,
  BASELINE_MODEL,
  BOOTSTRAP_MODEL,
  BOOTSTRAP_MODEL_VERSION,
  createLogisticScorer,
} from "./model.js";

const vector = (overrides: Partial<FeatureVector> = {}): FeatureVector => ({
  candidateCount: 0,
  maxTrigram: 0,
  meanTrigram: 0,
  maxPhonetic: 0,
  minClassDistance: 2,
  goodsMax: 0,
  ...overrides,
});

describe("BASELINE_MODEL", () => {
  test("always scores the base rate", () => {
    expect(BASELINE_MODEL.score(vector({ maxTrigram: 1 }))).toBe(BASE_RATE);
    expect(BASELINE_MODEL.score(vector())).toBe(BASE_RATE);
  });
});

describe("createLogisticScorer", () => {
  test("is deterministic (M6.1 replay)", () => {
    const scorer = createLogisticScorer(
      { intercept: 0, trigram: 2, phonetic: 0, classAdjacency: 0, goods: 0, crowdedness: 0 },
      "test-1",
    );
    const features = vector({ maxTrigram: 0.7 });
    expect(scorer.score(features)).toBe(scorer.score(features));
    expect(scorer.version).toBe("test-1");
  });

  test("increases with trigram similarity", () => {
    const scorer = createLogisticScorer(
      { intercept: 0, trigram: 2, phonetic: 0, classAdjacency: 0, goods: 0, crowdedness: 0 },
      "test-2",
    );
    expect(scorer.score(vector({ maxTrigram: 0.9 }))).toBeGreaterThan(scorer.score(vector({ maxTrigram: 0.1 })));
  });

  test("stays within 0..1 under extreme coefficients", () => {
    const wide = createLogisticScorer(
      { intercept: 100, trigram: 100, phonetic: 0, classAdjacency: 0, goods: 0, crowdedness: 0 },
      "wide",
    );
    expect(wide.score(vector({ maxTrigram: 1 }))).toBeLessThanOrEqual(1);
    expect(wide.score(vector({ maxTrigram: 1 }))).toBeGreaterThan(0);
  });

  test("rewards class adjacency (distance 0 over distance 2)", () => {
    const scorer = createLogisticScorer(
      { intercept: 0, trigram: 0, phonetic: 0, classAdjacency: 1, goods: 0, crowdedness: 0 },
      "class",
    );
    expect(scorer.score(vector({ minClassDistance: 0 }))).toBeGreaterThan(
      scorer.score(vector({ minClassDistance: 2 })),
    );
  });
});

describe("BOOTSTRAP_MODEL", () => {
  test("carries its version and produces a plausible score", () => {
    expect(BOOTSTRAP_MODEL.version).toBe(BOOTSTRAP_MODEL_VERSION);
    const score = BOOTSTRAP_MODEL.score(
      vector({ candidateCount: 3, maxTrigram: 0.9, maxPhonetic: 1, minClassDistance: 0, goodsMax: 0.8 }),
    );
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });
});
