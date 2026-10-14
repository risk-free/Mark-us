import type { FeatureCandidate, QueryMark } from "./features.js";
import { BOOTSTRAP_MODEL } from "./model.js";
import { CorpusAssessmentScorer, INSUFFICIENT_DATA, scoreCandidates } from "./score.js";

const query: QueryMark = { markText: "ACME", classCodes: [9], goodsSummary: "software services" };

const candidate = (overrides: Partial<FeatureCandidate> = {}): FeatureCandidate => ({
  serialNumber: "11111111",
  markText: "AKME",
  score: 0.8,
  classCodes: [9],
  goodsSummary: "software services",
  ...overrides,
});

const DISCLAIMER_VERSION = "disclaimer-1.0.0";

describe("scoreCandidates", () => {
  test("returns the full assessment contract for a populated candidate set", () => {
    const result = scoreCandidates(query, [candidate()], BOOTSTRAP_MODEL, DISCLAIMER_VERSION);
    expect(result.status).toBe("scored");
    expect(result.pRegistration).toBeGreaterThan(0);
    expect(result.pRegistration).toBeLessThanOrEqual(1);
    expect(result.modelVersion).toBe(BOOTSTRAP_MODEL.version);
    expect(result.disclaimerVersion).toBe(DISCLAIMER_VERSION);
    expect(result.isLegalAdvice).toBe(false);
    expect(result.method).toBe("trigram");
    expect(result.disclaimer.length).toBeGreaterThan(20);
    expect(result.subSignals).toMatchObject({ candidateCount: 1, maxTrigram: 0.8, minClassDistance: 0 });
    expect(result.featureSnapshot.topCandidates).toEqual([
      { serialNumber: "11111111", markText: "AKME", score: 0.8 },
    ]);
  });

  test("degrades to INSUFFICIENT_DATA without candidates (M6.4)", () => {
    const result = scoreCandidates(query, [], BOOTSTRAP_MODEL, DISCLAIMER_VERSION);
    expect(result.status).toBe(INSUFFICIENT_DATA);
    expect(result.pRegistration).toBeNull();
    expect(result.riskFlags).toContain("NO_CORPUS_CANDIDATES");
    expect(result.riskFlags).toContain(INSUFFICIENT_DATA);
  });

  test("is reproducible for the same input (M6.1)", () => {
    const first = scoreCandidates(query, [candidate()], BOOTSTRAP_MODEL, DISCLAIMER_VERSION);
    const second = scoreCandidates(query, [candidate()], BOOTSTRAP_MODEL, DISCLAIMER_VERSION);
    expect(first.pRegistration).toBe(second.pRegistration);
  });
});

describe("CorpusAssessmentScorer", () => {
  test("searches then scores, passing the limit through", async () => {
    const calls: number[] = [];
    const searcher = {
      async search(_query: string, options?: { limit?: number }) {
        calls.push(options?.limit ?? -1);
        return { candidates: [candidate()] };
      },
    };
    const scorer = new CorpusAssessmentScorer({
      searcher,
      model: BOOTSTRAP_MODEL,
      disclaimerVersion: DISCLAIMER_VERSION,
      limit: 5,
    });
    const result = await scorer.score(query);
    expect(calls).toEqual([5]);
    expect(result.status).toBe("scored");
    expect(result.modelVersion).toBe(BOOTSTRAP_MODEL.version);
  });
});
