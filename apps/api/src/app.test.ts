import type { CorpusRunSummary, CorpusStore, CorpusSearchResult } from "@markus/tm-data";

import { createApp, type AppServices } from "./app.js";

const now = new Date("2026-10-13T12:00:00.000Z");

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

const app = (search: AppServices["search"], store: FakeStore) =>
  createApp({ search, store }, { freshnessSlaHours: 26 });

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