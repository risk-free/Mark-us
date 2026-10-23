import type { AssessmentScore, CorpusRunSummary, CorpusStore, CorpusSearchResult, QueryMark } from "@markus/tm-data";

import {
  createApp,
  type AppOptions,
  type AppServices,
  type AssistantAnswer,
  type AssistantCitation,
  type AssistantInput,
  type AssistantService,
} from "./app.js";
import { InMemoryAssessmentCache } from "./assessment-cache.js";
import { createInMemoryAuth } from "./auth/fakes.js";
import { MetricsRegistry } from "./metrics.js";
import { InMemoryRateLimiter } from "./rate-limit.js";

const now = new Date();

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

interface AppOverrides {
  auth?: AppServices["auth"];
  assistant?: AppServices["assistant"];
  cache?: AppServices["cache"];
  rateLimiter?: AppServices["rateLimiter"];
  metrics?: AppServices["metrics"];
  assessmentCacheTtlSeconds?: AppOptions["assessmentCacheTtlSeconds"];
  assessRateIpPerHour?: AppOptions["assessRateIpPerHour"];
  assessRateMarkPerHour?: AppOptions["assessRateMarkPerHour"];
  assistantRateIpPerHour?: AppOptions["assistantRateIpPerHour"];
  assistantPromptVersion?: AppOptions["assistantPromptVersion"];
  modelVersion?: AppOptions["modelVersion"];
  disclaimerVersion?: AppOptions["disclaimerVersion"];
  metricsEnabled?: AppOptions["metricsEnabled"];
}

const app = (
  search: AppServices["search"],
  store: FakeStore,
  assess: AppServices["assess"] = fakeAssess(),
  overrides: AppOverrides = {},
) => {
  const { auth: authOverride, assistant, cache, rateLimiter, metrics, ...options } = overrides;
  const auth = authOverride ?? createInMemoryAuth();
  return createApp(
    { search, store, assess, assistant, cache, rateLimiter, metrics, auth },
    { freshnessSlaHours: 26, ...options },
  );
};

const testCitation: AssistantCitation = {
  index: 1,
  id: "basics",
  title: "Trademark basics",
  section: "basics",
  url: "https://www.uspto.gov/trademarks/basics",
  lang: "en",
};

interface FakeAssistant extends AssistantService {
  lastInput?: AssistantInput;
}

const stubAssistant = (build: (input: AssistantInput) => AssistantAnswer): FakeAssistant => {
  const fake: FakeAssistant = {
    async answer(input: AssistantInput) {
      fake.lastInput = input;
      return build(input);
    },
  };
  return fake;
};

const okAnswer = (locale: string): AssistantAnswer => ({
  status: "ok",
  answer: "File in the class that matches your goods [1].",
  citations: [testCitation],
  locale,
  version: "rag-1.0.0",
  provider: "primary",
  model: "test-model",
});

const degradedAnswer = (locale: string): AssistantAnswer => ({
  status: "degraded",
  answer: null,
  citations: [testCitation],
  locale,
  version: "rag-1.0.0",
});

const postAssistant = (handler: ReturnType<typeof app>, body: unknown) =>
  handler.request("/tm/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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
  test("returns and caps recent runs for a MASTER_ADMIN session", async () => {
    const store = new FakeStore();
    store.runs = [
      { id: "r2", runDate: new Date("2026-10-13"), status: "complete", filesProcessed: 1, marksUpserted: 0, marksSkipped: 1, marksImported: 0, marksUpdated: 0, marksRejected: 0, startedAt: new Date("2026-10-13T03:10:00Z"), finishedAt: new Date("2026-10-13T03:11:00Z") },
      { id: "r1", runDate: new Date("2026-10-12"), status: "complete", filesProcessed: 1, marksUpserted: 2, marksSkipped: 0, marksImported: 2, marksUpdated: 0, marksRejected: 1, startedAt: new Date("2026-10-12T03:10:00Z"), finishedAt: new Date("2026-10-12T03:11:00Z") },
    ];
    const auth = createInMemoryAuth();
    const session = await auth.sessions.create({
      actorType: "STAFF",
      actorId: "admin-1",
      role: "MASTER_ADMIN",
      locale: "zh-CN",
      ip: "127.0.0.1",
      ua: "jest",
    });
    const response = await app(fakeSearch("x"), store, fakeAssess(), { auth }).request(
      "/tm/ingest/runs",
      { headers: { cookie: `mkus_staff=${session.id}` } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0].id).toBe("r2");
    expect(body.runs[1].marksRejected).toBe(1);
  });

  test("denies anonymous and non-admin principals (tm.ingest.read)", async () => {
    const anonymous = await app(fakeSearch("x"), new FakeStore()).request("/tm/ingest/runs");
    expect(anonymous.status).toBe(401);

    const auth = createInMemoryAuth();
    const session = await auth.sessions.create({
      actorType: "STAFF",
      actorId: "expert-1",
      role: "EXPERT",
      locale: "zh-CN",
      ip: "127.0.0.1",
      ua: "jest",
    });
    const forbidden = await app(fakeSearch("x"), new FakeStore(), fakeAssess(), { auth }).request(
      "/tm/ingest/runs",
      { headers: { cookie: `mkus_staff=${session.id}` } },
    );
    expect(forbidden.status).toBe(403);
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

describe("createApp /tm/assess cache (M8.1)", () => {
  test("serves a second identical query from cache without re-scoring", async () => {
    const cache = new InMemoryAssessmentCache();
    let calls = 0;
    const assess: AppServices["assess"] = {
      async score(query: QueryMark) {
        calls += 1;
        return { ...assessment, featureSnapshot: { ...assessment.featureSnapshot, query } };
      },
    };
    const handler = app(fakeSearch("x"), new FakeStore(), assess, {
      cache,
      modelVersion: "bootstrap-0.1.0",
      disclaimerVersion: "disclaimer-1.0.0",
    });

    const first = await handler.request("/tm/assess?q=ACME&niceClass=9&goods=software");
    const second = await handler.request("/tm/assess?q=ACME&niceClass=9&goods=software");

    expect(calls).toBe(1);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      pRegistration: 0.62,
      corpusFreshness: { status: "unknown" },
    });
  });

  test("does not cache without the version pair", async () => {
    const cache = new InMemoryAssessmentCache();
    let calls = 0;
    const assess: AppServices["assess"] = {
      async score(query: QueryMark) {
        calls += 1;
        return { ...assessment, featureSnapshot: { ...assessment.featureSnapshot, query } };
      },
    };
    const handler = app(fakeSearch("x"), new FakeStore(), assess, { cache });

    await handler.request("/tm/assess?q=ACME");
    await handler.request("/tm/assess?q=ACME");
    expect(calls).toBe(2);
  });
});

describe("createApp /tm/assess rate limit (M8.2)", () => {
  test("returns 429 with a Retry-After header once the limit is passed", async () => {
    const rateLimiter = new InMemoryRateLimiter();
    const handler = app(fakeSearch("x"), new FakeStore(), fakeAssess(), {
      rateLimiter,
      assessRateIpPerHour: 1,
      assessRateMarkPerHour: 100,
    });

    expect((await handler.request("/tm/assess?q=ACME")).status).toBe(200);
    const blocked = await handler.request("/tm/assess?q=ACME");

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("3600");
    await expect(blocked.json()).resolves.toEqual({ error: "rate limit exceeded" });
  });

  test("does not leak mark existence in the 429 body", async () => {
    const rateLimiter = new InMemoryRateLimiter();
    const handler = app(fakeSearch("x"), new FakeStore(), fakeAssess(), {
      rateLimiter,
      assessRateIpPerHour: 1,
    });

    await handler.request("/tm/assess?q=SECRETCO");
    const blocked = await handler.request("/tm/assess?q=SECRETCO");
    expect(await blocked.text()).not.toContain("SECRETCO");
  });
});

describe("createApp /metrics (M8.1)", () => {
  test("exposes Prometheus metrics when enabled", async () => {
    const metrics = new MetricsRegistry();
    const handler = app(fakeSearch("x"), new FakeStore(), fakeAssess(), { metrics, metricsEnabled: true });

    await handler.request("/tm/assess?q=ACME");
    const response = await handler.request("/metrics");

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("assessment_duration_seconds");
    expect(text).toContain("# TYPE http_requests_total counter");
    expect(text).toContain('route="/tm/assess"');
    expect(text).not.toContain("ACME");
  });

  test("does not expose /metrics when disabled", async () => {
    const metrics = new MetricsRegistry();
    const handler = app(fakeSearch("x"), new FakeStore(), fakeAssess(), { metrics });

    const response = await handler.request("/metrics");
    expect(response.status).toBe(404);
  });
});

describe("createApp /tm/assistant (P6.3 disclosure + M6.4)", () => {
  const handler = (assistant: AppServices["assistant"], overrides: AppOverrides = {}) =>
    app(fakeSearch("x"), new FakeStore(), fakeAssess(), { assistant, ...overrides });

  test("rejects a missing or blank markText", async () => {
    const appHandler = handler(stubAssistant((input) => okAnswer(input.locale ?? "zh-CN")));

    const missing = await postAssistant(appHandler, {});
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: "missing required field: markText" });

    const blank = await postAssistant(appHandler, { markText: "   " });
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toEqual({ error: "missing required field: markText" });
  });

  test("rejects a body that is not valid JSON", async () => {
    const response = await handler(undefined).request("/tm/assistant", {
      method: "POST",
      body: "not-json",
    });
    expect(response.status).toBe(400);
  });

  test("ok: answers with citations and the full 3-locale disclosure envelope", async () => {
    const appHandler = handler(stubAssistant((input) => okAnswer(input.locale ?? "zh-CN")));
    const response = await postAssistant(appHandler, {
      markText: "ACME",
      classCodes: [9],
      jurisdiction: "US",
      businessDescription: "software",
      locale: "en",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      answer: "File in the class that matches your goods [1].",
      locale: "en",
      isLegalAdvice: false,
      modelVersion: "rag-1.0.0",
      disclaimerVersion: "disclaimer-1.0.0",
      provider: "primary",
      model: "test-model",
    });
    expect(body.answer).not.toBeNull();
    expect(body.citations).toEqual([testCitation]);
    expect(Object.keys(body.disclaimers).sort()).toEqual(["en", "zh-CN", "zh-TW"]);
    expect(body.disclaimer).toBe(body.disclaimers.en);
  });

  test("degraded (M6.4): 200 with citations, no answer, and full disclosure", async () => {
    const appHandler = handler(stubAssistant((input) => degradedAnswer(input.locale ?? "zh-CN")));
    const response = await postAssistant(appHandler, { markText: "ACME" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "degraded",
      answer: null,
      locale: "zh-CN",
      isLegalAdvice: false,
      modelVersion: "rag-1.0.0",
      disclaimerVersion: "disclaimer-1.0.0",
    });
    expect(body.citations).toHaveLength(1);
    expect(body.disclaimers).toMatchObject({
      en: expect.any(String),
      "zh-CN": expect.any(String),
      "zh-TW": expect.any(String),
    });
    expect(body.provider).toBeUndefined();
    expect(body.model).toBeUndefined();
  });

  test("degrades with empty citations when no assistant is wired", async () => {
    const response = await postAssistant(app(fakeSearch("x"), new FakeStore()), { markText: "ACME" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "degraded",
      answer: null,
      citations: [],
      locale: "zh-CN",
      isLegalAdvice: false,
      modelVersion: "rag-unknown",
      disclaimerVersion: "disclaimer-1.0.0",
    });
  });

  test("rate limits per IP and leaks no mark text in the 429 body", async () => {
    const rateLimiter = new InMemoryRateLimiter();
    const appHandler = handler(stubAssistant((input) => okAnswer(input.locale ?? "zh-CN")), {
      rateLimiter,
      assistantRateIpPerHour: 1,
    });

    expect((await postAssistant(appHandler, { markText: "ACME" })).status).toBe(200);
    const blocked = await postAssistant(appHandler, { markText: "SECRETCO" });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("3600");
    const text = await blocked.text();
    expect(text).toContain("rate limit exceeded");
    expect(text).not.toContain("SECRETCO");
  });

  test("falls back to zh-CN for an unsupported locale", async () => {
    const assistant = stubAssistant((input) => okAnswer(input.locale ?? "zh-CN"));
    const body = await (await postAssistant(handler(assistant), { markText: "ACME", locale: "fr-FR" })).json();

    expect(body.locale).toBe("zh-CN");
    expect(assistant.lastInput?.locale).toBe("zh-CN");
  });

  test("passes only minimised fields and filters out-of-range class codes (M6.3)", async () => {
    const assistant = stubAssistant((input) => okAnswer(input.locale ?? "zh-CN"));
    const response = await postAssistant(handler(assistant), {
      markText: "  ACME  ",
      classCodes: [9, 0, 46, 2.5, 25],
      jurisdiction: " US ",
      businessDescription: "software",
      locale: "zh-TW",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+1 202 555 0100",
      question: "what should I do?",
    });

    expect(response.status).toBe(200);
    expect(assistant.lastInput).toEqual({
      markText: "ACME",
      locale: "zh-TW",
      classCodes: [9, 25],
      jurisdiction: "US",
      businessDescription: "software",
    });
    expect(assistant.lastInput).not.toHaveProperty("name");
    expect(assistant.lastInput).not.toHaveProperty("email");
    expect(assistant.lastInput).not.toHaveProperty("phone");
    expect(assistant.lastInput).not.toHaveProperty("question");
  });
});