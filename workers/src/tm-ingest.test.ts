import type { Env } from "@markus/config";
import { OdpTdxfSource, SourceUnavailableError } from "@markus/tm-data";
import type { CorpusMarkInput, CorpusStore, FinishRunInput, ParseOutcome, TrademarkSource, UpsertAction } from "@markus/tm-data";

import {
  buildCorpusSources,
  isTmIngestSkip,
  RESEARCHER_ONLY_NIGHTLY_REASON,
  resolveIngestSpec,
  runNightlyTmIngest,
  runTmIngest,
} from "./tm-ingest.js";

/** Hand-built Env: only the fields the source builder reads. */
const fakeEnv = {
  USPTO_BULK_BASE_URL: "https://data.uspto.gov",
  USPTO_RESEARCHER_PRODUCT_ID: "TRCFECO2",
  TM_CORPUS_INGEST_SOURCE: "trcfeco2",
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

  test("selects the ODP TDXF source from the job spec (P5.2)", () => {
    const sources = buildCorpusSources(fakeEnv, { source: "tdxf" });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.name).toBe("uspto-odp-tdxf");
  });

  test("selects the ODP TDXF source from env config when the spec is silent", () => {
    const env = { ...fakeEnv, TM_CORPUS_INGEST_SOURCE: "tdxf" } as Env;

    expect(buildCorpusSources(env)[0]?.name).toBe("uspto-odp-tdxf");
  });
});

describe("resolveIngestSpec (job-spec / env config precedence)", () => {
  test("payload fields win over env config", () => {
    const env = {
      ...fakeEnv,
      TM_CORPUS_INGEST_YEARS: [2024],
      TM_CORPUS_INGEST_SOURCE: "tdxf",
    } as unknown as Env;

    expect(resolveIngestSpec(env, { years: [2025, 2026], table: "assignment", source: "trcfeco2" })).toEqual({
      source: "trcfeco2",
      years: [2025, 2026],
      table: "assignment",
    });
  });

  test("env config fills fields the payload leaves unset", () => {
    const env = { ...fakeEnv, TM_CORPUS_INGEST_YEARS: [2024] } as unknown as Env;

    expect(resolveIngestSpec(env, {})).toEqual({
      source: "trcfeco2",
      years: [2024],
      table: "case_file",
    });
  });

  test("defaults: trcfeco2, run-year backfill, case_file table", () => {
    expect(resolveIngestSpec(fakeEnv, {})).toEqual({
      source: "trcfeco2",
      years: undefined,
      table: "case_file",
    });
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

  test("FA-011: a gated ODP TDXF source skips with reason and never opens a run", async () => {
    const store = new FakeStore();

    const result = await runTmIngest(
      { source: "tdxf" },
      { store, env: { ...fakeEnv, TM_CORPUS_INGEST_SOURCE: "tdxf" } as Env },
    );

    expect(isTmIngestSkip(result)).toBe(true);
    if (isTmIngestSkip(result)) {
      expect(result.code).toBe("FA-011");
      expect(result.reason).toContain("FA-011");
    }
    expect(store.startedWith).toBeUndefined();
    expect(store.finished).toBeUndefined();
  });

  test("FA-011 thrown mid-run by an injected source also skips without failing", async () => {
    const store = new FakeStore();

    const result = await runTmIngest(
      { runDate: "2026-10-13" },
      { store, env: fakeEnv, sources: [new OdpTdxfSource({ baseUrl: "https://data.uspto.gov" })] },
    );

    expect(isTmIngestSkip(result)).toBe(true);
    expect(store.startedWith).toBeUndefined();
  });

  test("non-FA-011 source failures propagate so BullMQ records the failed job", async () => {
    const store = new FakeStore();
    const failing: TrademarkSource = {
      name: "flaky",
      // eslint-disable-next-line require-yield
      async *fetchRecords(): AsyncIterable<ParseOutcome> {
        throw new SourceUnavailableError("signed-URL endpoint responded 503", "HTTP_ERROR");
      },
    };

    await expect(
      runTmIngest({ runDate: "2026-10-13" }, { store, env: fakeEnv, sources: [failing] }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR" });
  });
});

describe("runNightlyTmIngest (P5.2 researcher-only nightly skip)", () => {
  test("default researcher-only source set: skips with reason, never opens a run", async () => {
    const store = new FakeStore();

    const result = await runNightlyTmIngest({}, { store, env: fakeEnv });

    expect(isTmIngestSkip(result)).toBe(true);
    if (isTmIngestSkip(result)) {
      expect(result.reason).toBe("researcher snapshot static; TDXF nightly pending FA-011");
      expect(result.reason).toBe(RESEARCHER_ONLY_NIGHTLY_REASON);
    }
    expect(store.startedWith).toBeUndefined();
    expect(store.finished).toBeUndefined();
  });

  test("a non-researcher source in the set runs the ingest", async () => {
    const store = new FakeStore();
    const tdxfLike: TrademarkSource = {
      name: "future-tdxf",
      async *fetchRecords() {
        yield record("1");
      },
    };

    const result = await runNightlyTmIngest(
      { runDate: "2026-10-13" },
      { store, env: fakeEnv, sources: [tdxfLike] },
    );

    expect(isTmIngestSkip(result)).toBe(false);
    if (!isTmIngestSkip(result)) {
      expect(result.marksImported).toBe(1);
    }
    expect(store.startedWith?.toISOString()).toBe(new Date("2026-10-13").toISOString());
  });

  test("tdxf selected while still gated: FA-011 skip-with-reason, no ledger run opened", async () => {
    const store = new FakeStore();

    const result = await runNightlyTmIngest(
      { source: "tdxf" },
      { store, env: { ...fakeEnv, TM_CORPUS_INGEST_SOURCE: "tdxf" } as Env },
    );

    expect(isTmIngestSkip(result)).toBe(true);
    if (isTmIngestSkip(result)) {
      expect(result.code).toBe("FA-011");
      expect(result.reason).not.toBe(RESEARCHER_ONLY_NIGHTLY_REASON);
    }
    expect(store.startedWith).toBeUndefined();
  });

  test("an explicitly empty source set is researcher-only (vacuous) and skips", async () => {
    const store = new FakeStore();

    const result = await runNightlyTmIngest({}, { store, env: fakeEnv, sources: [] });

    expect(isTmIngestSkip(result)).toBe(true);
    expect(store.startedWith).toBeUndefined();
  });
});
