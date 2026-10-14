import type { AssessmentScore, CorpusRunSummary, CorpusStore, CorpusSearchResult, QueryMark } from "@markus/tm-data";

import { createApp, type AppServices } from "./app.js";

const now = new Date("2026-10-13T12:00:00.000Z");

const assessment: AssessmentScore = {
  status: "scored",
  pRegistration: 0.62,
  method: "trigram",
  isLegalAdvice: false,
  disclaimer: "not legal advice",
  disclaimers: { en: "not legal advice", "zh-CN": "非法律意见", "zh-TW": "非法律意見" },
  disclaimerVersion: "disclaimer-1.0.0",
  modelVersion: "bootstrap-0.1.0",
  headlineConfidence: "MEDIUM",
  subSignals: { candidateCount: 2, maxTrigram: 0.7, maxPhonetic: 0.6, minClassDistance: 0, goodsMax: 0.5 },
  riskFlags: ["LIKELY_CONFLICT"],
  recommendedNextActions: ["Have a qualified trademark attorney review the result before filing."],
  featureSnapshot: {
    query: { markText: "ACME", classCodes: [9], goodsSummary: null },
    modelVersion: "bootstrap-0.1.0",
    topCandidates: [],
  },
};

interface FakeAssessor {
  score(query: QueryMark): Promise<AssessmentScore>;
  lastQuery?: QueryMark;
}

const fakeAssess = (): FakeAssessor => {
  const fake: FakeAssessor = {
    async score(query: QueryMark) {
      fake.lastQuery = query;
      return { ...assessment, featureSnapshot: { ...assessment.featureSnapshot, query } };
    },
  };
  return fake;
};

const searchResult = (query: string): CorpusSearchResult => ({
  query,
  method: "trigram",
  minScore: 0.3,
  isLegalAdvice: false,
  disclaimer: "not legal advice",
  candidates: [],
});

const fakeSearch = (query: string): AppServices["search"] => ({
  search: async (q, _options) => searchResult(q ?? query),
});

class FakeStore implements CorpusStore {
  lastCompleted: Date | null = null;
  runs: CorpusRunSummary[] = [];

  async startRun(): Promise<string> {
    throw new Error("not exercised");
  }

  async upsertMark(): Promise<"imported" | "updated" | "skipped"> {
    throw new Error("not exercised");
  }

  async finishRun(): Promise<void> {
    throw new Error("not exercised");
  }

  async failRun(): Promise<void> {
    throw new Error("not exercised");
  }

  async lastCompletedRunAt(): Promise<Date | null> {
    return this.lastCompleted;
  }

  async recentRuns(): Promise<Awaited<ReturnType<CorpusStore["recentRuns"]>>> {
    return this.runs;
  }
}

const app = (search: AppServices["search"], store: FakeStore, assess: AppServices["assess"] = fakeAssess()) =>
  createApp({ search, store, assess }, { freshnessSlaHours: 26 });

describe("createApp /tm/search (M7.2)", () => {
  test("rejects a request without q", async () => {
    const response = await app(fakeSearch("x"), new FakeStore()).request("/tm/search");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "missing required query parameter: q" });
  });

  test("returns the corpus signal contract plus fresh status", async () => {
    const store = new FakeStore();
    store.lastCompleted = new Date(now.getTime() - 3_600_000);
    const response = await app(fakeSearch("ACME"), store).request("/tm/search?q=ACME");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      query: "ACME",
      method: "trigram",
      isLegalAdvice: false,
      disclaimer: "not legal advice",
      candidates: [],
      corpusFreshness: { status: "fresh", ageHours: expect.any(Number), slaHours: 26 },
    });
  });

  test("reports stale past the SLA (M7.1 gate)", async () => {
    const store = new FakeStore();
    store.lastCompleted = new Date(now.getTime() - 27 * 3_600_000);
    const body = await (await app(fakeSearch("x"), store).request("/tm/search?q=x")).json();
    expect(body.corpusFreshness.status).toBe("stale");
    expect(body.corpusFreshness.ageHours).toBeGreaterThan(26);
  });

  test("reports unknown before any completed run", async () => {
    const body = await (await app(fakeSearch("x"), new FakeStore()).request("/tm/search?q=x")).json();
    expect(body.corpusFreshness).toMatchObject({ status: "unknown", lastCompletedAt: null });
  });
});

describe("createApp /tm/ingest/runs (M7.1 ledger)", () => {
  test("returns and caps recent runs", async () => {
    const store = new FakeStore();
    store.runs = [
      { id: "r2", runDate: new Date("2026-10-13"), status: "complete", filesProcessed: 1, marksUpserted: 0, marksSkipped: 1, marksImported: 0, marksUpdated: 0, marksRejected: 0, startedAt: new Date("2026-10-13T03:10:00Z"), finishedAt: new Date("2026-10-13T03:11:00Z") },
      { id: "r1", runDate: new Date("2026-10-12"), status: "complete", filesProcessed: 1, marksUpserted: 2, marksSkipped: 0, marksImported: 2, marksUpdated: 0, marksRejected: 1, startedAt: new Date("2026-10-12T03:10:00Z"), finishedAt: new Date("2026-10-12T03:11:00Z") },
    ];
    const body = await (await app(fakeSearch("x"), store).request("/tm/ingest/runs")).json();
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0].id).toBe("r2");
    expect(body.runs[1].marksRejected).toBe(1);
  });
});

describe("createApp /tm/assess (P5.5 disclosure)", () => {
  test("rejects a missing query", async () => {
    const response = await app(fakeSearch("x"), new FakeStore()).request("/tm/assess");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "missing required query parameter: q" });
  });

  test("returns the assessment payload with model version, 3-locale disclaimer and freshness", async () => {
    const store = new FakeStore();
    store.lastCompleted = new Date(now.getTime() - 3_600_000);
    const response = await app(fakeSearch("x"), store).request("/tm/assess?q=ACME&niceClass=9&goods=software");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "scored",
      pRegistration: 0.62,
      modelVersion: "bootstrap-0.1.0",
      disclaimerVersion: "disclaimer-1.0.0",
      isLegalAdvice: false,
      headlineConfidence: "MEDIUM",
      disclaimers: { en: "not legal advice", "zh-CN": "非法律意见", "zh-TW": "非法律意見" },
      corpusFreshness: { status: "fresh", slaHours: 26 },
    });
    expect(body.recommendedNextActions.length).toBeGreaterThan(0);
  });

  test("parses niceClass and goods into the query mark (ignoring an out-of-range class)", async () => {
    const assess = fakeAssess();
    await app(fakeSearch("x"), new FakeStore(), assess).request("/tm/assess?q=ACME&niceClass=99&goods=software");
    expect(assess.lastQuery).toEqual({ markText: "ACME", classCodes: [], goodsSummary: "software" });

    const assess2 = fakeAssess();
    await app(fakeSearch("x"), new FakeStore(), assess2).request("/tm/assess?q=ACME&niceClass=25");
    expect(assess2.lastQuery).toEqual({ markText: "ACME", classCodes: [25], goodsSummary: null });
  });
});