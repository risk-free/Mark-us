import { runCorpusIngest, MAX_REJECT_LOG } from "./ingest.js";
import type { CorpusStore, FinishRunInput, UpsertAction } from "./store.js";
import type { TrademarkSource } from "./source.js";
import type { CorpusMarkInput, ParseOutcome } from "./types.js";

const mark = (serialNumber: string, sourceUpdatedAt: Date | null = null): CorpusMarkInput => ({
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
  sourceUpdatedAt,
});

const record = (serialNumber: string, sourceUpdatedAt: Date | null = null): ParseOutcome => ({
  kind: "record",
  record: mark(serialNumber, sourceUpdatedAt),
});

class FakeStore implements CorpusStore {
  readonly marks = new Map<string, CorpusMarkInput>();
  finished: ({ ingestRunId: string } & FinishRunInput) | undefined;
  failed: { ingestRunId: string; errorLog: unknown } | undefined;
  started = 0;
  failNextUpsert = false;

  async startRun(): Promise<string> {
    this.started += 1;
    return `run_${this.started}`;
  }

  async upsertMark(input: CorpusMarkInput): Promise<UpsertAction> {
    if (this.failNextUpsert) throw new Error("db down");
    const existing = this.marks.get(input.serialNumber);
    if (!existing) {
      this.marks.set(input.serialNumber, input);
      return "imported";
    }
    const incoming = input.sourceUpdatedAt;
    const stored = existing.sourceUpdatedAt;
    if (incoming !== null && stored !== null && incoming.getTime() <= stored.getTime()) return "skipped";
    this.marks.set(input.serialNumber, input);
    return "updated";
  }

  async finishRun(ingestRunId: string, input: FinishRunInput): Promise<void> {
    this.finished = { ingestRunId, ...input };
  }

  async failRun(ingestRunId: string, errorLog: unknown): Promise<void> {
    this.failed = { ingestRunId, errorLog };
  }

  async lastCompletedRunAt(): Promise<Date | null> {
    return null;
  }

  async recentRuns(): Promise<Awaited<ReturnType<CorpusStore["recentRuns"]>>> {
    return [];
  }
}

const sourceOf = (outcomes: ParseOutcome[]): TrademarkSource => ({
  name: "fake",
  async *fetchRecords() {
    for (const outcome of outcomes) yield outcome;
  },
});

const runDate = new Date("2026-10-13T00:00:00.000Z");

describe("runCorpusIngest", () => {
  test("counts records by upsert action and persists a completed run", async () => {
    const store = new FakeStore();
    const source = sourceOf([
      record("1"),
      record("2"),
      { kind: "skip", reason: "not-a-word-mark" },
      { kind: "skip", reason: "not-live" },
    ]);

    const report = await runCorpusIngest({ runDate, sources: [source], store });

    expect(report).toMatchObject({
      filesProcessed: 1,
      marksImported: 2,
      marksUpdated: 0,
      marksSkipped: 2,
      marksRejected: 0,
      marksUpserted: 2,
    });
    expect(store.finished?.ingestRunId).toBe("run_1");
    expect(store.finished?.errorLog).toBeNull();
    expect(store.failed).toBeUndefined();
  });

  test("quarantines malformed records into the reject count + errorLog without failing the run", async () => {
    const store = new FakeStore();
    const source = sourceOf([
      record("1"),
      { kind: "reject", reason: "missing-serial-number", raw: "{}" },
      { kind: "reject", reason: "invalid-filing-date", raw: "{}" },
    ]);

    const report = await runCorpusIngest({ runDate, sources: [source], store });

    expect(report.marksRejected).toBe(2);
    expect(report.marksImported).toBe(1);
    expect(store.finished?.errorLog).toEqual([
      { reason: "missing-serial-number", raw: "{}" },
      { reason: "invalid-filing-date", raw: "{}" },
    ]);
    expect(store.failed).toBeUndefined();
  });

  test("caps the persisted reject log", async () => {
    const store = new FakeStore();
    const rejects = Array.from({ length: MAX_REJECT_LOG + 5 }, (_, i) => ({
      kind: "reject" as const,
      reason: `bad-${i}`,
      raw: "{}",
    }));

    const report = await runCorpusIngest({ runDate, sources: [sourceOf(rejects)], store });

    expect(report.marksRejected).toBe(MAX_REJECT_LOG + 5);
    expect(store.finished?.errorLog).toHaveLength(MAX_REJECT_LOG);
  });

  test("reports updates when the source has newer data", async () => {
    const store = new FakeStore();
    await store.upsertMark(mark("1", new Date("2024-01-01T00:00:00.000Z")), "seed");

    const report = await runCorpusIngest({
      runDate,
      sources: [sourceOf([record("1", new Date("2024-02-01T00:00:00.000Z"))])],
      store,
    });

    expect(report).toMatchObject({ marksImported: 0, marksUpdated: 1, marksSkipped: 0 });
  });

  test("marks the run failed and rethrows when a source or the store throws", async () => {
    const store = new FakeStore();
    store.failNextUpsert = true;

    await expect(runCorpusIngest({ runDate, sources: [sourceOf([record("1")])], store })).rejects.toThrow(
      "db down",
    );
    expect(store.failed).toMatchObject({ ingestRunId: "run_1", errorLog: { message: "db down" } });
    expect(store.finished).toBeUndefined();
  });
});
