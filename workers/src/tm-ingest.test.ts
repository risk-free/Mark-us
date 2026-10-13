import type { Env } from "@markus/config";
import type { CorpusMarkInput, CorpusStore, FinishRunInput, ParseOutcome, TrademarkSource, UpsertAction } from "@markus/tm-data";

import { buildCorpusSources, runTmIngest } from "./tm-ingest.js";

/** Hand-built Env: only the two fields the source builder reads. */
const fakeEnv = {
  USPTO_BULK_BASE_URL: "https://data.uspto.gov",
  USPTO_RESEARCHER_PRODUCT_ID: "TRCFECO2",
} as Env;

const mark = (serialNumber: string): CorpusMarkInput => ({
  serialNumber,
  registrationNumber: null,
  markText: "ACME",
  normalizedText: "acme",
  statusCode: "700",
  filingDate: null,
  registrationDate: null,
  abandonDate: null,
  goodsSummary: null,
  classes: [],
  sourceFile: "f",
  sourceUpdatedAt: null,
});

const record = (serialNumber: string): ParseOutcome => ({ kind: "record", record: mark(serialNumber) });

class FakeStore implements CorpusStore {
  startedWith: Date | undefined;
  finished: FinishRunInput | undefined;

  async startRun(runDate: Date): Promise<string> {
    this.startedWith = runDate;
    return "run_1";
  }

  async upsertMark(): Promise<UpsertAction> {
    return "imported";
  }

  async finishRun(_ingestRunId: string, input: FinishRunInput): Promise<void> {
    this.finished = input;
  }

  async failRun(): Promise<void> {}

  async lastCompletedRunAt(): Promise<Date | null> {
    return null;
  }

  /** Interface is gaining `recentRuns` concurrently; fakes implement it already. */
  async recentRuns(): Promise<never[]> {
    return [];
  }
}

describe("buildCorpusSources", () => {
  test("wires the researcher signed-URL backfill source", () => {
    const sources = buildCorpusSources(fakeEnv);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.name).toBe("uspto-researcher-trcfeco2");
    expect(typeof sources[0]?.fetchRecords).toBe("function");
  });
});

describe("runTmIngest", () => {
  test("defaults runDate to roughly the previous UTC day", async () => {
    const store = new FakeStore();
    const before = Date.now();

    await runTmIngest({}, { store, env: fakeEnv, sources: [] });

    const after = Date.now();
    const runDate = store.startedWith;
    expect(runDate).toBeDefined();
    expect(runDate!.getTime()).toBeGreaterThan(before - 86_400_000 - 5_000);
    expect(runDate!.getTime()).toBeLessThan(after - 86_400_000 + 5_000);
  });

  test("passes an explicit runDate through unchanged", async () => {
    const store = new FakeStore();

    await runTmIngest({ runDate: "2026-10-13" }, { store, env: fakeEnv, sources: [] });

    expect(store.startedWith?.toISOString()).toBe(new Date("2026-10-13").toISOString());
  });

  test("maps source outcomes onto the report counters", async () => {
    const store = new FakeStore();
    const source: TrademarkSource = {
      name: "fake",
      async *fetchRecords() {
        yield { kind: "skip", reason: "not-a-word-mark" };
        yield record("1");
        yield { kind: "reject", reason: "missing-serial-number", raw: "{}" };
      },
    };

    const report = await runTmIngest(
      { runDate: "2026-10-13" },
      { store, env: fakeEnv, sources: [source] },
    );

    expect(report).toMatchObject({
      ingestRunId: "run_1",
      filesProcessed: 1,
      marksImported: 1,
      marksUpdated: 0,
      marksSkipped: 1,
      marksRejected: 1,
      marksUpserted: 1,
    });
    expect(store.finished?.errorLog).toEqual([
      { reason: "missing-serial-number", raw: "{}" },
    ]);
    expect(await store.recentRuns()).toEqual([]);
  });
});
