import { extractFeatures, type FeatureCandidate, type QueryMark } from "./features.js";

const query: QueryMark = { markText: "ACME", classCodes: [9], goodsSummary: "software services" };

const candidate = (overrides: Partial<FeatureCandidate>): FeatureCandidate => ({
  serialNumber: "1",
  markText: "ACME",
  score: 0.8,
  classCodes: [9],
  goodsSummary: "software services",
  ...overrides,
});

describe("extractFeatures", () => {
  test("returns a no-evidence vector for an empty candidate set", () => {
    expect(extractFeatures(query, [])).toEqual({
      candidateCount: 0,
      maxTrigram: 0,
      meanTrigram: 0,
      maxPhonetic: 0,
      minClassDistance: 2,
      goodsMax: 0,
    });
  });

  test("aggregates trigram, phonetic, class and goods signals", () => {
    const features = extractFeatures(query, [
      candidate({ serialNumber: "a", markText: "AKME", score: 0.8 }),
      candidate({ serialNumber: "b", markText: "Zebra", score: 0.4, classCodes: [25], goodsSummary: "clothing" }),
    ]);
    expect(features.candidateCount).toBe(2);
    expect(features.maxTrigram).toBe(0.8);
    expect(features.meanTrigram).toBeCloseTo(0.6, 10);
    expect(features.maxPhonetic).toBe(1);
    expect(features.minClassDistance).toBe(0);
    expect(features.goodsMax).toBe(1);
  });

  test("uses the closest related class and ignores unrelated ones", () => {
    const features = extractFeatures(
      { markText: "ACME", classCodes: [9], goodsSummary: null },
      [candidate({ markText: "Beta", score: 0.5, classCodes: [42], goodsSummary: null })],
    );
    expect(features.minClassDistance).toBe(1);
    expect(features.goodsMax).toBe(0);
  });

  test("prefers an explicit normalizedText when present", () => {
    const features = extractFeatures(query, [
      candidate({ markText: "un-normalised", normalizedText: "akme", score: 0.5 }),
    ]);
    expect(features.maxPhonetic).toBe(1);
  });
});
